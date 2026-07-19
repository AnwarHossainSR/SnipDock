import { useId } from "react";
import type { Category, Id } from "../../api/types";

interface CategorySelectProps {
  categories: Category[];
  value: Id | null;
  onChange: (id: Id | null) => void;
  label?: string;
  disabled?: boolean;
}

export default function CategorySelect(props: CategorySelectProps) {
  const { categories, value, onChange, label = "Category", disabled } = props;
  const selectId = useId();
  const builtIn = categories.filter((category) => category.built_in);
  const custom = categories.filter((category) => !category.built_in);

  function renderOptions(entries: Category[]) {
    return entries.map((category) => (
      <option value={category.id} key={category.id}>{category.name}</option>
    ));
  }

  return (
    <label className="snippet-editor__field" htmlFor={selectId}>
      <span>{label}</span>
      <select
        id={selectId}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      >
        <option value="">No category</option>
        {builtIn.length > 0 && custom.length > 0
          ? (
            <>
              <optgroup label="Built-in">{renderOptions(builtIn)}</optgroup>
              <optgroup label="Custom">{renderOptions(custom)}</optgroup>
            </>
          )
          : renderOptions(categories)}
      </select>
    </label>
  );
}
