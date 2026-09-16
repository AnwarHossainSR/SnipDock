use crate::error::AppError;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
    time::{Duration, Instant},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::State;

/// What SnipDock itself is costing the machine right now.
///
/// A Tauri application is not one process: the main binary owns the Rust side
/// and the platform webview runs its own helpers beside it. Reporting only the
/// main process would understate the real footprint by most of it, so every
/// figure here covers the whole process tree rooted at this executable.
#[derive(Serialize)]
pub struct ResourceUsage {
    /// Resident memory across the process tree, in bytes.
    pub memory_bytes: u64,
    /// Share of the main process's own memory, in bytes. The remainder is the
    /// webview and any other helper.
    pub main_memory_bytes: u64,
    /// CPU across the tree, as a share of the whole machine: 100 means every
    /// core saturated, which is what Task Manager and Activity Monitor show.
    /// Summing the per-process figures gives a per-core number instead - on an
    /// eight-core machine a thoroughly idle app reads as 29% there and 3.6%
    /// here - so the total is divided by `cpu_cores` before it is reported.
    /// It is a delta since the previous reading, so the first one is always 0.
    pub cpu_percent: f32,
    /// Logical cores on this machine, the divisor behind `cpu_percent`.
    pub cpu_cores: u32,
    /// How many OS processes SnipDock is running, including the main one.
    pub process_count: u32,
    /// Process id of the main SnipDock process.
    pub pid: u32,
    /// True once a previous reading exists to compare against, so the UI can
    /// tell "idle" apart from "not measured yet".
    pub cpu_ready: bool,
}

/// Holds the `System` between calls. CPU usage is a delta between two
/// refreshes, so keeping one instance alive lets each poll report real numbers
/// without the command having to sleep through a sampling interval.
///
/// It also caches the process tree. Finding the tree needs every process on the
/// machine, because the only way to know a pid is ours is to walk its parents -
/// and asking for all of them means the OS opens and measures several hundred
/// processes, which on a five-second poll costs more CPU than everything this
/// readout is watching. The tree itself barely changes, so it is rediscovered
/// on the interval below and every poll in between refreshes only our own
/// handful of pids.
pub struct ResourceMonitor {
    system: Mutex<System>,
    sampled: Mutex<bool>,
    tree: Mutex<TreeCache>,
}

/// The last known process tree, and when it was last rediscovered.
#[derive(Default)]
struct TreeCache {
    pids: Vec<Pid>,
    scanned_at: Option<Instant>,
}

impl TreeCache {
    /// A cheap refresh is only safe while the cached tree is both non-empty and
    /// recent; otherwise a newly spawned webview helper would stay invisible.
    fn is_fresh(&self) -> bool {
        !self.pids.is_empty()
            && self
                .scanned_at
                .is_some_and(|at| at.elapsed() < TREE_RESCAN_INTERVAL)
    }
}

/// How long a discovered process tree is trusted before a full scan runs
/// again. Long enough that the expensive scan is a small fraction of polls,
/// short enough that a webview helper appearing or exiting shows up promptly.
const TREE_RESCAN_INTERVAL: Duration = Duration::from_secs(30);

impl Default for ResourceMonitor {
    fn default() -> Self {
        Self {
            system: Mutex::new(System::new()),
            sampled: Mutex::new(false),
            tree: Mutex::new(TreeCache::default()),
        }
    }
}

/// Guards against a cycle in the reported parent links, which would otherwise
/// hang the walk. No real process tree is anywhere near this deep.
const MAX_ANCESTRY_DEPTH: usize = 32;

/// Every pid whose ancestry reaches `root`, plus `root` itself.
fn process_tree(parents: &HashMap<Pid, Option<Pid>>, root: Pid) -> HashSet<Pid> {
    let mut tree = HashSet::from([root]);
    for &pid in parents.keys() {
        let mut current = pid;
        for _ in 0..MAX_ANCESTRY_DEPTH {
            if tree.contains(&current) {
                tree.insert(pid);
                break;
            }
            match parents.get(&current).copied().flatten() {
                Some(parent) => current = parent,
                None => break,
            }
        }
    }
    tree
}

pub fn read(monitor: &ResourceMonitor) -> Result<ResourceUsage, AppError> {
    let pid = sysinfo::get_current_pid().map_err(|error| {
        AppError::new(
            crate::error::ErrorCode::Internal,
            format!("could not identify the SnipDock process: {error}"),
        )
    })?;

    let mut system = monitor
        .system
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut cache = monitor
        .tree
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let refresh = ProcessRefreshKind::nothing().with_cpu().with_memory();

    if cache.is_fresh() {
        // `Some` leaves every other process in `system` holding stale figures,
        // so the accounting below reads the cached pids by name rather than
        // iterating `processes()`.
        system.refresh_processes_specifics(ProcessesToUpdate::Some(&cache.pids), true, refresh);
    } else {
        system.refresh_processes_specifics(ProcessesToUpdate::All, true, refresh);
        let parents: HashMap<Pid, Option<Pid>> = system
            .processes()
            .iter()
            .map(|(&pid, process)| (pid, process.parent()))
            .collect();
        let tree: HashSet<Pid> = process_tree(&parents, pid);
        cache.pids = tree.into_iter().collect();
        cache.scanned_at = Some(Instant::now());
    }

    let mut memory_bytes = 0u64;
    let mut cpu_total = 0f32;
    let mut process_count = 0u32;
    let mut main_memory_bytes = 0u64;
    // A pid that has since exited is simply gone from the map; it stays in the
    // cache until the next full scan, which costs nothing but a lookup miss.
    for &process_pid in &cache.pids {
        let Some(process) = system.process(process_pid) else {
            continue;
        };
        memory_bytes += process.memory();
        cpu_total += process.cpu_usage();
        process_count += 1;
        if process_pid == pid {
            main_memory_bytes = process.memory();
        }
    }
    drop(cache);

    let cpu_cores = std::thread::available_parallelism()
        .map(|cores| cores.get() as u32)
        .unwrap_or(1)
        .max(1);

    let mut sampled = monitor
        .sampled
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let cpu_ready = *sampled;
    *sampled = true;

    Ok(ResourceUsage {
        memory_bytes,
        main_memory_bytes,
        cpu_percent: cpu_total / cpu_cores as f32,
        cpu_cores,
        process_count,
        pid: pid.as_u32(),
        cpu_ready,
    })
}

#[tauri::command]
pub(super) async fn get_resource_usage(
    monitor: State<'_, ResourceMonitor>,
) -> Result<ResourceUsage, AppError> {
    read(&monitor)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pid(value: usize) -> Pid {
        Pid::from(value)
    }

    #[test]
    fn tree_collects_descendants_at_any_depth() {
        // 1 -> 10 (us) -> 20 -> 30, with 40 belonging to an unrelated tree.
        let parents = HashMap::from([
            (pid(1), None),
            (pid(10), Some(pid(1))),
            (pid(20), Some(pid(10))),
            (pid(30), Some(pid(20))),
            (pid(40), Some(pid(1))),
        ]);

        let tree = process_tree(&parents, pid(10));

        assert_eq!(tree, HashSet::from([pid(10), pid(20), pid(30)]));
    }

    #[test]
    fn tree_holds_a_lone_process() {
        let parents = HashMap::from([(pid(10), Some(pid(1))), (pid(1), None)]);

        assert_eq!(process_tree(&parents, pid(10)), HashSet::from([pid(10)]));
    }

    #[test]
    fn tree_survives_a_parent_cycle() {
        // A reported cycle must not hang the walk, however it arose.
        let parents = HashMap::from([
            (pid(10), None),
            (pid(20), Some(pid(30))),
            (pid(30), Some(pid(20))),
        ]);

        assert_eq!(process_tree(&parents, pid(10)), HashSet::from([pid(10)]));
    }

    #[test]
    fn reading_reports_this_process_and_withholds_cpu_until_it_can_measure() {
        let monitor = ResourceMonitor::default();

        let first = read(&monitor).expect("current process is readable");
        assert!(first.process_count >= 1);
        assert!(first.memory_bytes > 0);
        assert!(first.main_memory_bytes > 0);
        // The main process is part of the tree, never more than all of it.
        assert!(first.main_memory_bytes <= first.memory_bytes);
        // Nothing to compare the first sample against, so CPU is not claimed.
        assert!(!first.cpu_ready);

        let second = read(&monitor).expect("current process is readable");
        assert!(second.cpu_ready);
        assert_eq!(second.pid, first.pid);
        // CPU is reported as a share of the machine, so it can never exceed
        // 100 however many cores are busy.
        assert!(second.cpu_cores >= 1);
        assert!(second.cpu_percent <= 100.0);
    }

    #[test]
    fn a_second_reading_reuses_the_discovered_tree() {
        let monitor = ResourceMonitor::default();

        let first = read(&monitor).expect("current process is readable");
        let scanned_at = monitor
            .tree
            .lock()
            .expect("tree cache is not poisoned")
            .scanned_at;
        assert!(scanned_at.is_some(), "the first read discovers the tree");

        let second = read(&monitor).expect("current process is readable");

        // Same tree, not rediscovered: the timestamp is untouched, which is
        // what says the expensive all-process scan was skipped.
        assert_eq!(
            monitor
                .tree
                .lock()
                .expect("tree cache is not poisoned")
                .scanned_at,
            scanned_at,
        );
        assert_eq!(second.process_count, first.process_count);
        assert!(second.main_memory_bytes > 0);
    }
}
