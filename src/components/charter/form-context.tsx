"use client";

import * as React from "react";
import type { CharterFormValues, FieldErrors } from "@/lib/charter/form";
import type { CharterFormOptions } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";

type Path = string;

export function getIn(obj: unknown, path: Path): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc == null ? acc : (acc as never)[key]), obj);
}

/** Immutable set by dotted path; array indices are numeric segments. */
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const container = obj as unknown as Record<string, unknown> | unknown[];
  const current = (container as Record<string, unknown>)[head];
  const nextValue = rest.length === 0 ? value : setIn(current, rest.join("."), value);
  if (Array.isArray(container)) {
    const copy = [...container];
    copy[Number(head)] = nextValue;
    return copy as unknown as T;
  }
  return { ...container, [head]: nextValue } as T;
}

let idCounter = 0;
/** Stable client-side id for list rows (works without crypto.randomUUID on plain http). */
export function newClientId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

interface CharterFormContextValue {
  values: CharterFormValues;
  errors: FieldErrors;
  options: CharterFormOptions;
  mode: "create" | "edit";
  set: (path: Path, value: unknown) => void;
  update: (fn: (values: CharterFormValues) => CharterFormValues) => void;
}

const CharterFormContext = React.createContext<CharterFormContextValue | null>(null);

export const CharterFormProvider = CharterFormContext.Provider;

export function useCharterForm(): CharterFormContextValue {
  const ctx = React.useContext(CharterFormContext);
  if (!ctx) throw new Error("useCharterForm must be used inside CharterFormProvider");
  return ctx;
}

const fieldId = (path: Path) => `f-${path.replace(/\./g, "-")}`;

interface BoundFieldProps {
  path: Path;
  label: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
}

export function TextField({
  path,
  label,
  hint,
  required,
  className,
  ...inputProps
}: BoundFieldProps & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const { values, errors, set } = useCharterForm();
  const error = errors[path];
  return (
    <Field label={label} htmlFor={fieldId(path)} error={error} hint={hint} required={required} className={className}>
      <Input
        id={fieldId(path)}
        value={(getIn(values, path) as string) ?? ""}
        onChange={(e) => set(path, e.target.value)}
        aria-invalid={!!error}
        {...inputProps}
      />
    </Field>
  );
}

export function TextAreaField({
  path,
  label,
  hint,
  required,
  className,
  ...textareaProps
}: BoundFieldProps & Omit<React.ComponentProps<"textarea">, "value" | "onChange">) {
  const { values, errors, set } = useCharterForm();
  const error = errors[path];
  return (
    <Field label={label} htmlFor={fieldId(path)} error={error} hint={hint} required={required} className={className}>
      <Textarea
        id={fieldId(path)}
        value={(getIn(values, path) as string) ?? ""}
        onChange={(e) => set(path, e.target.value)}
        aria-invalid={!!error}
        {...textareaProps}
      />
    </Field>
  );
}

export function SelectField({
  path,
  label,
  hint,
  required,
  className,
  placeholder = "Please select",
  options,
}: BoundFieldProps & { placeholder?: string; options: readonly { value: string; label: string }[] }) {
  const { values, errors, set } = useCharterForm();
  const error = errors[path];
  return (
    <Field label={label} htmlFor={fieldId(path)} error={error} hint={hint} required={required} className={className}>
      <Select
        id={fieldId(path)}
        value={(getIn(values, path) as string) ?? ""}
        onChange={(e) => set(path, e.target.value)}
        aria-invalid={!!error}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Options for "person" selects. */
export function useUserOptions() {
  const { options } = useCharterForm();
  return React.useMemo(
    () => options.users.map((u) => ({ value: u.id, label: u.team ? `${u.name} (${u.team})` : u.name })),
    [options.users],
  );
}
