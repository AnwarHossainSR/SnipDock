use crate::error::AppError;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
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
    /// CPU across the tree, as a percentage where 100 is one core saturated.
    /// It is a delta since the previous reading, so the first one is always 0.
    pub cpu_percent: f32,
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
pub struct ResourceMonitor {
    system: Mutex<System>,
    sampled: Mutex<bool>,
}

impl Default for ResourceMonitor {
    fn default() -> Self {
        Self {
            system: Mutex::new(System::new()),
            sampled: Mutex::new(false),
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
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_cpu().with_memory(),
    );

    let parents: HashMap<Pid, Option<Pid>> = system
        .processes()
        .iter()
        .map(|(&pid, process)| (pid, process.parent()))
        .collect();
    let tree = process_tree(&parents, pid);

    let mut memory_bytes = 0u64;
    let mut cpu_percent = 0f32;
    let mut process_count = 0u32;
    let mut main_memory_bytes = 0u64;
    for (&process_pid, process) in system.processes() {
        if !tree.contains(&process_pid) {
            continue;
        }
        memory_bytes += process.memory();
        cpu_percent += process.cpu_usage();
        process_count += 1;
        if process_pid == pid {
            main_memory_bytes = process.memory();
        }
    }

    let mut sampled = monitor
        .sampled
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let cpu_ready = *sampled;
    *sampled = true;

    Ok(ResourceUsage {
        memory_bytes,
        main_memory_bytes,
        cpu_percent,
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
    }
}
