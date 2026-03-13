"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  GripVertical,
  Trash2,
  Eye,
  Share2,
  BarChart3,
  Settings,
  Type,
  List,
  CheckSquare,
  Star,
  Hash,
  MapPin,
  Calendar,
  User,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Copy,
  QrCode,
  X,
  Check,
  AlertCircle,
} from "lucide-react";

// ── Types ──

type QuestionType =
  | "text"
  | "single_select"
  | "multi_choice"
  | "rating"
  | "nps"
  | "location"
  | "date"
  | "person"
  | "file"
  | "number";

interface Question {
  id?: string;
  type: QuestionType;
  config: {
    label?: string;
    description?: string;
    placeholder?: string;
    options?: string[];
    [key: string]: unknown;
  };
  position: number;
  required: boolean;
  display_condition: DisplayCondition | null;
}

interface DisplayCondition {
  questionId: string;
  operator: "equals" | "not_equals" | "contains";
  value: string;
}

interface FormData {
  id: string;
  title: string;
  description: string | null;
  settings: Record<string, unknown>;
  theme: Record<string, unknown>;
  questions: Question[];
  createdAt: string;
}

interface ResponseData {
  id: string;
  formId: string;
  respondentId: string | null;
  answers: Record<string, unknown>;
  submittedAt: string;
}

type TabId = "builder" | "responses";

// ── Constants ──

const QUESTION_TYPES: {
  type: QuestionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "single_select", label: "Single Select", icon: List },
  { type: "multi_choice", label: "Multi Choice", icon: CheckSquare },
  { type: "rating", label: "Rating", icon: Star },
  { type: "nps", label: "NPS", icon: BarChart3 },
  { type: "number", label: "Number", icon: Hash },
  { type: "date", label: "Date", icon: Calendar },
  { type: "location", label: "Location", icon: MapPin },
  { type: "person", label: "Person", icon: User },
  { type: "file", label: "File", icon: Paperclip },
];

// ── Helpers ──

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function generateTempId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Main Component ──

export default function FormBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = params.id as string;

  const [form, setForm] = useState<FormData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">(
    "saved"
  );
  const [activeTab, setActiveTab] = useState<TabId>(
    (searchParams.get("tab") as TabId) || "builder"
  );
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number | null>(
    null
  );
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(
    null
  );

  // Responses state
  const [responses, setResponses] = useState<ResponseData[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data Fetching ──

  const fetchForm = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/forms/${formId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setForm(data.form);
        setTitle(data.form.title);
        setDescription(data.form.description || "");
        setQuestions(
          (data.form.questions || []).map(
            (q: Record<string, unknown>) =>
              ({
                id: q.id,
                type: q.type,
                config: q.config || {},
                position: q.position ?? 0,
                required: q.required ?? false,
                display_condition: q.displayCondition || null,
              }) as Question
          )
        );
      }
    } catch (err) {
      console.error("Failed to fetch form:", err);
    } finally {
      setIsLoading(false);
    }
  }, [formId]);

  const fetchResponses = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    setResponsesLoading(true);
    try {
      const res = await fetch(`/api/forms/${formId}/responses?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses || []);
      }
    } catch (err) {
      console.error("Failed to fetch responses:", err);
    } finally {
      setResponsesLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    fetchForm();
  }, [fetchForm]);

  useEffect(() => {
    if (activeTab === "responses") {
      fetchResponses();
    }
  }, [activeTab, fetchResponses]);

  // ── Auto-save ──

  const saveForm = useCallback(
    async (
      currentTitle: string,
      currentDesc: string,
      currentQuestions: Question[]
    ) => {
      const token = getCookie("session_token");
      if (!token) return;

      setSaveStatus("saving");
      setIsSaving(true);

      try {
        const res = await fetch(`/api/forms/${formId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: currentTitle,
            description: currentDesc || null,
            questions: currentQuestions.map((q, idx) => ({
              type: q.type,
              config: q.config,
              position: idx,
              required: q.required,
              display_condition: q.display_condition,
            })),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Update question IDs from server
          setQuestions(
            (data.form.questions || []).map(
              (q: Record<string, unknown>) =>
                ({
                  id: q.id,
                  type: q.type,
                  config: q.config || {},
                  position: q.position ?? 0,
                  required: q.required ?? false,
                  display_condition: q.displayCondition || null,
                }) as Question
            )
          );
          setSaveStatus("saved");
        }
      } catch (err) {
        console.error("Failed to save form:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [formId]
  );

  const scheduleSave = useCallback(
    (t: string, d: string, q: Question[]) => {
      setSaveStatus("unsaved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveForm(t, d, q), 1000);
    },
    [saveForm]
  );

  // ── Question Operations ──

  const addQuestion = (type: QuestionType) => {
    const newQ: Question = {
      id: generateTempId(),
      type,
      config: {
        label: `Question ${questions.length + 1}`,
        options:
          type === "single_select" || type === "multi_choice"
            ? ["Option 1", "Option 2"]
            : undefined,
      },
      position: questions.length,
      required: false,
      display_condition: null,
    };
    const updated = [...questions, newQ];
    setQuestions(updated);
    setSelectedQuestionIdx(updated.length - 1);
    setShowTypePicker(false);
    scheduleSave(title, description, updated);
  };

  const removeQuestion = (idx: number) => {
    const updated = questions.filter((_, i) => i !== idx);
    setQuestions(updated);
    if (selectedQuestionIdx === idx) setSelectedQuestionIdx(null);
    else if (selectedQuestionIdx !== null && selectedQuestionIdx > idx)
      setSelectedQuestionIdx(selectedQuestionIdx - 1);
    scheduleSave(title, description, updated);
  };

  const updateQuestion = (idx: number, patch: Partial<Question>) => {
    const updated = questions.map((q, i) => (i === idx ? { ...q, ...patch } : q));
    setQuestions(updated);
    scheduleSave(title, description, updated);
  };

  const updateQuestionConfig = (
    idx: number,
    configPatch: Partial<Question["config"]>
  ) => {
    const updated = questions.map((q, i) =>
      i === idx ? { ...q, config: { ...q.config, ...configPatch } } : q
    );
    setQuestions(updated);
    scheduleSave(title, description, updated);
  };

  // ── Drag & Drop ──

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const updated = [...questions];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(targetIdx, 0, moved);
    setQuestions(updated);
    if (selectedQuestionIdx === dragIdx) setSelectedQuestionIdx(targetIdx);
    setDragIdx(null);
    setDragOverIdx(null);
    scheduleSave(title, description, updated);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // ── Title/Description changes ──

  const handleTitleChange = (val: string) => {
    setTitle(val);
    scheduleSave(val, description, questions);
  };

  const handleDescChange = (val: string) => {
    setDescription(val);
    scheduleSave(title, val, questions);
  };

  // ── Render ──

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading form...</div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Form not found</p>
          <button
            onClick={() => router.push("/app/forms")}
            className="mt-4 text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            Back to Forms
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/app/forms")}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="text-lg font-semibold text-gray-900 border-none outline-none bg-transparent focus:ring-0 w-64"
            placeholder="Form title..."
          />
          <span className="text-xs text-gray-400">
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "unsaved"
                ? "Unsaved changes"
                : "Saved"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
              showPreview
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={() => setShowShareDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 flex-shrink-0">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("builder")}
            className={`py-3 text-sm font-medium border-b-2 ${
              activeTab === "builder"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Builder
          </button>
          <button
            onClick={() => setActiveTab("responses")}
            className={`py-3 text-sm font-medium border-b-2 flex items-center gap-1.5 ${
              activeTab === "responses"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Responses
            {responses.length > 0 && (
              <span className="ml-1 bg-gray-200 text-gray-700 text-xs rounded-full px-2 py-0.5">
                {responses.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showPreview ? (
          <PreviewMode
            title={title}
            description={description}
            questions={questions}
          />
        ) : activeTab === "builder" ? (
          <div className="h-full flex">
            {/* Questions List */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto">
                {/* Form header card */}
                <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
                  <input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="w-full text-xl font-bold text-gray-900 border-none outline-none bg-transparent mb-2"
                    placeholder="Form title..."
                  />
                  <textarea
                    value={description}
                    onChange={(e) => handleDescChange(e.target.value)}
                    className="w-full text-sm text-gray-500 border-none outline-none bg-transparent resize-none"
                    placeholder="Add a description..."
                    rows={2}
                  />
                </div>

                {/* Questions */}
                {questions.map((q, idx) => {
                  const typeInfo = QUESTION_TYPES.find(
                    (t) => t.type === q.type
                  );
                  const Icon = typeInfo?.icon || Type;
                  const isSelected = selectedQuestionIdx === idx;

                  return (
                    <div
                      key={q.id || idx}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={() => handleDrop(idx)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedQuestionIdx(idx)}
                      className={`bg-white rounded-lg border mb-3 transition-all ${
                        dragOverIdx === idx
                          ? "border-blue-400 border-dashed"
                          : isSelected
                            ? "border-blue-500 ring-1 ring-blue-200"
                            : "border-gray-200 hover:border-gray-300"
                      } ${dragIdx === idx ? "opacity-50" : ""}`}
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Drag handle */}
                          <div className="mt-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                            <GripVertical className="w-4 h-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Question header */}
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <input
                                value={
                                  (q.config.label as string) ||
                                  ""
                                }
                                onChange={(e) =>
                                  updateQuestionConfig(idx, {
                                    label: e.target.value,
                                  })
                                }
                                className="flex-1 font-medium text-gray-900 border-none outline-none bg-transparent text-sm"
                                placeholder="Question title..."
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                {typeInfo?.label}
                              </span>
                            </div>

                            {/* Question description */}
                            <input
                              value={
                                (q.config.description as string) || ""
                              }
                              onChange={(e) =>
                                updateQuestionConfig(idx, {
                                  description: e.target.value,
                                })
                              }
                              className="w-full text-xs text-gray-400 border-none outline-none bg-transparent ml-6"
                              placeholder="Add a description (optional)..."
                              onClick={(e) => e.stopPropagation()}
                            />

                            {/* Options for select types */}
                            {(q.type === "single_select" ||
                              q.type === "multi_choice") && (
                              <div className="mt-3 ml-6 space-y-2">
                                {((q.config.options as string[]) || []).map(
                                  (opt, optIdx) => (
                                    <div
                                      key={optIdx}
                                      className="flex items-center gap-2"
                                    >
                                      <div
                                        className={`w-4 h-4 border-2 border-gray-300 ${
                                          q.type === "single_select"
                                            ? "rounded-full"
                                            : "rounded"
                                        }`}
                                      />
                                      <input
                                        value={opt}
                                        onChange={(e) => {
                                          const opts = [
                                            ...((q.config.options as string[]) ||
                                              []),
                                          ];
                                          opts[optIdx] = e.target.value;
                                          updateQuestionConfig(idx, {
                                            options: opts,
                                          });
                                        }}
                                        className="flex-1 text-sm text-gray-700 border-none outline-none bg-transparent"
                                        placeholder={`Option ${optIdx + 1}`}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const opts = (
                                            (q.config.options as string[]) || []
                                          ).filter((_, i) => i !== optIdx);
                                          updateQuestionConfig(idx, {
                                            options: opts,
                                          });
                                        }}
                                        className="text-gray-300 hover:text-red-500"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const opts = [
                                      ...((q.config.options as string[]) || []),
                                      `Option ${((q.config.options as string[]) || []).length + 1}`,
                                    ];
                                    updateQuestionConfig(idx, { options: opts });
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-6"
                                >
                                  + Add option
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            {/* Required toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuestion(idx, {
                                  required: !q.required,
                                });
                              }}
                              className={`text-xs px-2 py-1 rounded ${
                                q.required
                                  ? "bg-red-100 text-red-600"
                                  : "bg-gray-100 text-gray-400 hover:text-gray-600"
                              }`}
                              title="Toggle required"
                            >
                              Required
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeQuestion(idx);
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add question button */}
                <div className="relative">
                  <button
                    onClick={() => setShowTypePicker(!showTypePicker)}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Question
                  </button>

                  {showTypePicker && (
                    <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-10">
                      <div className="grid grid-cols-2 gap-1">
                        {QUESTION_TYPES.map((qt) => {
                          const QtIcon = qt.icon;
                          return (
                            <button
                              key={qt.type}
                              onClick={() => addQuestion(qt.type)}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700"
                            >
                              <QtIcon className="w-4 h-4 text-gray-400" />
                              {qt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Question Config */}
            {selectedQuestionIdx !== null &&
              questions[selectedQuestionIdx] && (
                <QuestionConfigPanel
                  question={questions[selectedQuestionIdx]}
                  questionIdx={selectedQuestionIdx}
                  allQuestions={questions}
                  onUpdate={(patch) =>
                    updateQuestion(selectedQuestionIdx, patch)
                  }
                  onUpdateConfig={(patch) =>
                    updateQuestionConfig(selectedQuestionIdx, patch)
                  }
                  onClose={() => setSelectedQuestionIdx(null)}
                />
              )}
          </div>
        ) : (
          /* Responses Tab */
          <ResponsesView
            responses={responses}
            questions={questions}
            isLoading={responsesLoading}
            expandedId={expandedResponseId}
            onToggleExpand={(id) =>
              setExpandedResponseId(
                expandedResponseId === id ? null : id
              )
            }
          />
        )}
      </div>

      {/* Share Dialog */}
      {showShareDialog && (
        <ShareDialog
          formId={formId}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  );
}

// ── Question Config Panel ──

function QuestionConfigPanel({
  question,
  questionIdx,
  allQuestions,
  onUpdate,
  onUpdateConfig,
  onClose,
}: {
  question: Question;
  questionIdx: number;
  allQuestions: Question[];
  onUpdate: (patch: Partial<Question>) => void;
  onUpdateConfig: (patch: Partial<Question["config"]>) => void;
  onClose: () => void;
}) {
  const [showCondition, setShowCondition] = useState(
    !!question.display_condition
  );

  const previousQuestions = allQuestions.slice(0, questionIdx);

  return (
    <div className="w-72 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-900">
          Question Settings
        </h3>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Type
          </label>
          <select
            value={question.type}
            onChange={(e) =>
              onUpdate({ type: e.target.value as QuestionType })
            }
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {QUESTION_TYPES.map((qt) => (
              <option key={qt.type} value={qt.type}>
                {qt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Title
          </label>
          <input
            value={(question.config.label as string) || ""}
            onChange={(e) => onUpdateConfig({ label: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Description
          </label>
          <textarea
            value={(question.config.description as string) || ""}
            onChange={(e) =>
              onUpdateConfig({ description: e.target.value })
            }
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
          />
        </div>

        {/* Required */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-500">Required</label>
          <button
            onClick={() => onUpdate({ required: !question.required })}
            className={`w-9 h-5 rounded-full transition-colors ${
              question.required ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                question.required ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Conditional Display */}
        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={() => {
              setShowCondition(!showCondition);
              if (showCondition) {
                onUpdate({ display_condition: null });
              }
            }}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 w-full"
          >
            {showCondition ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Conditional Display
          </button>

          {showCondition && previousQuestions.length > 0 && (
            <div className="mt-3 space-y-2">
              <select
                value={question.display_condition?.questionId || ""}
                onChange={(e) =>
                  onUpdate({
                    display_condition: {
                      questionId: e.target.value,
                      operator:
                        question.display_condition?.operator || "equals",
                      value: question.display_condition?.value || "",
                    },
                  })
                }
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
              >
                <option value="">Select question...</option>
                {previousQuestions.map((pq, pIdx) => (
                  <option key={pq.id || pIdx} value={pq.id || ""}>
                    {(pq.config.label as string) ||
                      `Question ${pIdx + 1}`}
                  </option>
                ))}
              </select>

              <select
                value={question.display_condition?.operator || "equals"}
                onChange={(e) =>
                  onUpdate({
                    display_condition: {
                      questionId:
                        question.display_condition?.questionId || "",
                      operator: e.target.value as
                        | "equals"
                        | "not_equals"
                        | "contains",
                      value: question.display_condition?.value || "",
                    },
                  })
                }
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
              >
                <option value="equals">Equals</option>
                <option value="not_equals">Does not equal</option>
                <option value="contains">Contains</option>
              </select>

              <input
                value={question.display_condition?.value || ""}
                onChange={(e) =>
                  onUpdate({
                    display_condition: {
                      questionId:
                        question.display_condition?.questionId || "",
                      operator:
                        question.display_condition?.operator || "equals",
                      value: e.target.value,
                    },
                  })
                }
                placeholder="Value..."
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
              />
            </div>
          )}

          {showCondition && previousQuestions.length === 0 && (
            <p className="mt-2 text-xs text-gray-400">
              Add questions above this one to set conditions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Preview Mode ──

function PreviewMode({
  title,
  description,
  questions,
}: {
  title: string;
  description: string;
  questions: Question[];
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  const shouldShow = (q: Question): boolean => {
    if (!q.display_condition) return true;
    const { questionId, operator, value } = q.display_condition;
    const answer = String(values[questionId] || "");
    switch (operator) {
      case "equals":
        return answer === value;
      case "not_equals":
        return answer !== value;
      case "contains":
        return answer.includes(value);
      default:
        return true;
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4 text-center">
          <span className="inline-block bg-blue-100 text-blue-600 text-xs font-medium px-3 py-1 rounded-full">
            Preview Mode
          </span>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-5 border-b border-gray-200">
            <h1 className="text-xl font-semibold text-gray-900">
              {title || "Untitled Form"}
            </h1>
            {description && (
              <p className="mt-2 text-gray-600">{description}</p>
            )}
          </div>

          <div className="px-6 py-4 space-y-5">
            {questions.filter(shouldShow).map((q, idx) => {
              const typeInfo = QUESTION_TYPES.find((t) => t.type === q.type);
              const Icon = typeInfo?.icon || Type;
              const qId = q.id || String(idx);

              return (
                <div key={qId}>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <Icon className="w-4 h-4 text-gray-400" />
                    {(q.config.label as string) || `Question ${idx + 1}`}
                    {q.required && <span className="text-red-500">*</span>}
                  </label>
                  {q.config.description && (
                    <p className="text-xs text-gray-400 mb-1.5">
                      {q.config.description as string}
                    </p>
                  )}
                  <PreviewField
                    question={q}
                    value={values[qId]}
                    onChange={(val) =>
                      setValues((prev) => ({ ...prev, [qId]: val }))
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="px-6 py-4 border-t border-gray-100">
            <button
              type="button"
              className="w-full px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg opacity-50 cursor-not-allowed"
              disabled
            >
              Submit (Preview Only)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  switch (question.type) {
    case "single_select": {
      const options = (question.config.options as string[]) || [];
      return (
        <select
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    case "multi_choice": {
      const options = (question.config.options as string[]) || [];
      const selected = (value as string[]) || [];
      return (
        <div className="space-y-1.5">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selected, opt]);
                  } else {
                    onChange(selected.filter((s) => s !== opt));
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
        </div>
      );
    }

    case "rating": {
      const current = Number(value) || 0;
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i === current ? null : i)}
              className="p-1"
            >
              <Star
                className={`w-6 h-6 ${
                  i <= current
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-300"
                }`}
              />
            </button>
          ))}
        </div>
      );
    }

    case "nps": {
      const current = value as number | undefined;
      return (
        <div className="flex gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={`w-8 h-8 rounded text-xs font-medium border ${
                current === i
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      );
    }

    case "number":
      return (
        <input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={(e) => onChange(e.target.valueAsNumber || null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Enter a number..."
        />
      );

    case "date":
      return (
        <input
          type="date"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      );

    default:
      return (
        <input
          type="text"
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder={
            (question.config.placeholder as string) || "Type your answer..."
          }
        />
      );
  }
}

// ── Responses View ──

function ResponsesView({
  responses,
  questions,
  isLoading,
  expandedId,
  onToggleExpand,
}: {
  responses: ResponseData[];
  questions: Question[];
  isLoading: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading responses...</div>
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">No responses yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Share your form to start collecting responses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">
            {responses.length} response{responses.length !== 1 ? "s" : ""}
          </h3>
        </div>

        {/* Responses table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-8">
                  #
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">
                  Submitted
                </th>
                {questions.slice(0, 3).map((q, idx) => (
                  <th
                    key={q.id || idx}
                    className="text-left px-4 py-3 font-medium text-gray-500 max-w-[200px] truncate"
                  >
                    {(q.config.label as string) || `Q${idx + 1}`}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {responses.map((resp, rIdx) => (
                <>
                  <tr
                    key={resp.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => onToggleExpand(resp.id)}
                  >
                    <td className="px-4 py-3 text-gray-400">{rIdx + 1}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(resp.submittedAt).toLocaleString()}
                    </td>
                    {questions.slice(0, 3).map((q, qIdx) => {
                      const answer = resp.answers[q.id || ""];
                      return (
                        <td
                          key={q.id || qIdx}
                          className="px-4 py-3 text-gray-700 max-w-[200px] truncate"
                        >
                          {answer !== undefined && answer !== null
                            ? Array.isArray(answer)
                              ? (answer as string[]).join(", ")
                              : String(answer)
                            : "—"}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      {expandedId === resp.id ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </td>
                  </tr>
                  {expandedId === resp.id && (
                    <tr key={`${resp.id}-expanded`}>
                      <td
                        colSpan={questions.slice(0, 3).length + 3}
                        className="px-4 py-4 bg-gray-50"
                      >
                        <div className="space-y-3 max-w-lg">
                          {questions.map((q, qIdx) => {
                            const answer = resp.answers[q.id || ""];
                            return (
                              <div key={q.id || qIdx}>
                                <div className="text-xs font-medium text-gray-500">
                                  {(q.config.label as string) ||
                                    `Question ${qIdx + 1}`}
                                </div>
                                <div className="text-sm text-gray-900 mt-0.5">
                                  {answer !== undefined && answer !== null
                                    ? Array.isArray(answer)
                                      ? (answer as string[]).join(", ")
                                      : String(answer)
                                    : "—"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Share Dialog ──

function ShareDialog({
  formId,
  onClose,
}: {
  formId: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/form/${formId}`
      : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Share Form</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Copy link */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Share Link
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* QR Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              QR Code
            </label>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 flex flex-col items-center">
              <div className="w-32 h-32 bg-white border border-gray-300 rounded-lg flex items-center justify-center mb-3">
                <QrCode className="w-20 h-20 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500">
                Scan to open the form on a mobile device
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
