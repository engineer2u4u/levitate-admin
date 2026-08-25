"use client";

import { useState } from "react";
import { createFacilitator, updateFacilitator } from "@/lib/store";
import { IMAGE_SIZES, type Facilitator } from "@/lib/types";
import ImageUpload from "./ImageUpload";
import { Field, Modal, ModalActions, input } from "./ui";
import { useToast } from "./AdminShell";

/** Create or edit a facilitator. Passing `facilitator` switches it to edit. */
export default function FacilitatorModal({
  facilitator,
  onClose,
}: {
  facilitator?: Facilitator;
  onClose: () => void;
}) {
  const toast = useToast();
  const editing = Boolean(facilitator);

  const [name, setName] = useState(facilitator?.name ?? "");
  const [title, setTitle] = useState(facilitator?.title ?? "");
  const [description, setDescription] = useState(facilitator?.description ?? "");
  const [imageUrl, setImageUrl] = useState(facilitator?.imageUrl ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give them a name.";
    if (!title.trim()) e.title = "A title says what they are on the course page.";
    setErrors(e);
    if (Object.keys(e).length) return;

    const payload = {
      name: name.trim(),
      title: title.trim(),
      description: description.trim(),
      imageUrl,
    };

    if (facilitator) {
      updateFacilitator(facilitator.id, payload);
      toast("Facilitator updated");
    } else {
      createFacilitator(payload);
      toast("Facilitator added");
    }
    onClose();
  };

  return (
    <Modal
      title={editing ? "Edit facilitator" : "New facilitator"}
      sub={editing ? facilitator?.name : "Pick them on a course once they are here"}
      onClose={onClose}
      width={520}
    >
      <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 13 }}>
        <ImageUpload
          label="Photograph"
          value={imageUrl}
          onChange={setImageUrl}
          folder="facilitators"
          size={IMAGE_SIZES.facilitator}
        />

        <Field label="Name" error={errors.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Parichita Kotnala" style={input} />
        </Field>

        <Field label="Title" error={errors.title} hint="Shown under the name, e.g. Lead POSH Trainer.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lead POSH Trainer" style={input} />
        </Field>

        <Field label="Description" hint="A short bio for the course page.">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Background, credentials, and what they bring to the room."
            style={{ ...input, resize: "vertical", lineHeight: 1.7 }}
          />
        </Field>

        <ModalActions>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            {editing ? "Save changes" : "Add facilitator"}
          </button>
        </ModalActions>
      </div>
    </Modal>
  );
}
