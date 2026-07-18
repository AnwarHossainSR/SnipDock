import type { LibraryItem } from "../../lib/types";

interface PrivateSnippetDialogProps {
  item: LibraryItem;
  onMakePrivate: () => void;
}

export default function PrivateSnippetDialog({ item, onMakePrivate }: PrivateSnippetDialogProps) {
  if (item.private) {
    return <p className="template-preview__note">Private item. Redacted from optional extensions.</p>;
  }
  return (
    <button type="button" className="button-secondary" onClick={onMakePrivate}>
      Mark private
    </button>
  );
}
