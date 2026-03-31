import { useRef, useState, type DragEvent } from "react";
import { theme } from "../styles/theme";

interface FileUploaderProps {
  open: boolean;
  onClose: () => void;
  onFileSelected: (file: File) => void;
}

export function FileUploader({
  open,
  onClose,
  onFileSelected,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (!open) return null;

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: theme.fontFamily,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 40,
          maxWidth: 500,
          width: "90%",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ color: theme.textDark, margin: "0 0 8px 0" }}>
          Charger un fichier
        </h2>
        <p style={{ color: theme.textMuted, margin: "0 0 24px 0" }}>
          CSV ou Excel exporté depuis JIRA
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragging ? theme.primary : theme.borderLight}`,
            borderRadius: 8,
            padding: "40px 20px",
            background: dragging ? theme.filterBarBg : "white",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onClick={() => inputRef.current?.click()}
        >
          <p
            style={{
              color: theme.textDark,
              fontSize: 16,
              margin: "0 0 8px 0",
            }}
          >
            Glissez votre fichier ici
          </p>
          <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>
            ou cliquez pour parcourir
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
}
