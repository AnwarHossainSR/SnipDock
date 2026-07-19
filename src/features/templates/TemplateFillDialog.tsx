interface TemplateFillDialogProps {
  placeholders: string[];
  values: Record<string, string>;
  onValueChange: (name: string, value: string) => void;
}

export default function TemplateFillDialog({
  placeholders,
  values,
  onValueChange,
}: TemplateFillDialogProps) {
  return (
    <section className="template-fill" aria-label="Fill template values">
      <h3>Fill values</h3>
      {placeholders.length === 0 ? (
        <p className="template-preview__note">Add placeholders like {"{{name}}"}.</p>
      ) : (
        <div className="template-fill__fields">
          {placeholders.map((name) => (
            <label className="snippet-editor__field" key={name}>
              <span>{name}</span>
              <input
                value={values[name] ?? ""}
                onChange={(event) => onValueChange(name, event.target.value)}
                autoComplete="off"
              />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
