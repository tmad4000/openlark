"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Type,
  Hash,
  Calendar as CalendarIcon,
  CheckSquare,
  Mail,
  Phone,
  Star,
  Clock,
  User,
  Paperclip,
  List,
  Link,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface FieldData {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}

interface FormData {
  id: string;
  name: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  requiredFields: string[];
  fields: FieldData[];
}

// Field type icons
const FIELD_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  long_text: Type,
  number: Hash,
  currency: Hash,
  percent: Hash,
  date: CalendarIcon,
  datetime: CalendarIcon,
  checkbox: CheckSquare,
  single_select: List,
  multi_select: List,
  user: User,
  attachment: Paperclip,
  url: Link,
  email: Mail,
  phone: Phone,
  rating: Star,
  duration: Clock,
};

export default function PublicFormPage() {
  const params = useParams();
  const token = params.token as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const fetchForm = async () => {
      try {
        const res = await fetch(`/api/public-forms/${token}`);
        if (res.ok) {
          const data = await res.json();
          setForm(data);
        } else if (res.status === 404) {
          setError("This form is not available or has been removed.");
        } else {
          setError("Failed to load form. Please try again later.");
        }
      } catch (err) {
        setError("Failed to load form. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchForm();
    }
  }, [token]);

  const handleFieldChange = (fieldId: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    // Validate required fields
    for (const fieldId of form.requiredFields) {
      const value = formValues[fieldId];
      if (value === undefined || value === null || value === "") {
        const field = form.fields.find((f) => f.id === fieldId);
        setError(`${field?.name || "Field"} is required`);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/public-forms/${token}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: formValues }),
      });

      if (res.ok) {
        setFormValues({});
        setShowSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit form");
      }
    } catch (err) {
      setError("Failed to submit form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFieldRequired = (fieldId: string) =>
    form?.requiredFields.includes(fieldId) || false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading form...</div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Form Not Available</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return null;
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Submitted!</h2>
          <p className="text-gray-600">{form.successMessage}</p>
          <button
            onClick={() => setShowSuccess(false)}
            className="mt-6 px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
          >
            Submit another response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Form header */}
            <div className="px-6 py-5 border-b border-gray-200">
              <h1 className="text-xl font-semibold text-gray-900">{form.name}</h1>
              {form.description && (
                <p className="mt-2 text-gray-600">{form.description}</p>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="px-6 py-3 bg-red-50 border-b border-red-100">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Form fields */}
            <div className="px-6 py-4 space-y-5">
              {form.fields.map((field) => {
                const Icon = FIELD_TYPE_ICONS[field.type] || Type;
                const required = isFieldRequired(field.id);
                const value = formValues[field.id];

                return (
                  <div key={field.id}>
                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                      <Icon className="w-4 h-4 text-gray-400" />
                      {field.name}
                      {required && <span className="text-red-500">*</span>}
                    </label>
                    <FormFieldInput
                      field={field}
                      value={value}
                      onChange={(val) => handleFieldChange(field.id, val)}
                      required={required}
                    />
                  </div>
                );
              })}
            </div>

            {/* Submit button */}
            <div className="px-6 py-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : form.submitLabel}
              </button>
            </div>
          </div>
        </form>

        {/* Powered by footer */}
        <div className="mt-6 text-center text-sm text-gray-400">
          Powered by OpenLark
        </div>
      </div>
    </div>
  );
}

// Form Field Input Component
function FormFieldInput({
  field,
  value,
  onChange,
  required,
}: {
  field: FieldData;
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
}) {
  switch (field.type) {
    case "checkbox":
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">Yes</span>
        </label>
      );

    case "number":
    case "currency":
    case "percent":
      return (
        <input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={(e) => onChange(e.target.valueAsNumber || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );

    case "date":
      return (
        <input
          type="date"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      );

    case "datetime":
      return (
        <input
          type="datetime-local"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      );

    case "single_select":
      const options = (field.config?.options as string[]) || [];
      return (
        <select
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case "long_text":
      return (
        <textarea
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={4}
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );

    case "email":
      return (
        <input
          type="email"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="email@example.com"
        />
      );

    case "url":
      return (
        <input
          type="url"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="https://..."
        />
      );

    case "phone":
      return (
        <input
          type="tel"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="+1 234 567 8900"
        />
      );

    case "rating":
      const currentRating = Number(value) || 0;
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i === currentRating ? null : i)}
              className="p-1"
            >
              <Star
                className={`w-6 h-6 ${
                  i <= currentRating
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-300 hover:text-yellow-200"
                }`}
              />
            </button>
          ))}
        </div>
      );

    default:
      return (
        <input
          type="text"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value || null)}
          required={required}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );
  }
}
