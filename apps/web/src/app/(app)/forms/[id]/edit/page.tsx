"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  type FormWithQuestions,
  type FormQuestionInfo,
  type FormQuestionType,
  type FormQuestionInput,
  type FormResponseInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Plus,
  GripVertical,
  Trash2,
  Copy,
  Check,
  Eye,
  Pencil,
  Share2,
  BarChart3,
  Settings,
  Loader2,
  Type,
  List,
  CheckSquare,
  Star,
  Hash,
  Calendar,
  MapPin,
  User,
  FileUp,
  ChevronDown,
  ChevronRight,
  QrCode,
  Link as LinkIcon,
  X,
} from "lucide-react";

const QUESTION_TYPES: {
  type: FormQuestionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "single_select", label: "Single Select", icon: List },
  { type: "multi_choice", label: "Multiple Choice", icon: CheckSquare },
  { type: "rating", label: "Rating", icon: Star },
  { type: "nps", label: "NPS", icon: BarChart3 },
  { type: "number", label: "Number", icon: Hash },
  { type: "date", label: "Date", icon: Calendar },
  { type: "location", label: "Location", icon: MapPin },
  { type: "person", label: "Person", icon: User },
  { type: "file", label: "File Upload", icon: FileUp },
];

function getQuestionTypeInfo(type: FormQuestionType) {
  return QUESTION_TYPES.find((t) => t.type === type) || QUESTION_TYPES[0];
}

type TabType = "builder" | "preview" | "responses" | "share";

export default function FormEditPage() {
  const params = useParams();
  const formId = params.id as string;

  const [form, setForm] = useState<FormWithQuestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("builder");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<FormQuestionInput[]>([]);
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [responses, setResponses] = useState<FormResponseInfo[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load form
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const result = await api.getForm(formId);
        setForm(result.form);
        setTitle(result.form.title);
        setDescription(result.form.description || "");
        setQuestions(
          result.form.questions.map((q) => ({
            id: q.id,
            type: q.type,
            config: q.config,
            position: q.position,
            required: q.required,
            displayCondition: q.displayCondition,
          }))
        );
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [formId]);

  // Auto-save with debounce
  const saveForm = useCallback(
    async (
      newTitle: string,
      newDesc: string,
      newQuestions: FormQuestionInput[]
    ) => {
      try {
        setSaving(true);
        const result = await api.updateForm(formId, {
          title: newTitle,
          description: newDesc || null,
          questions: newQuestions.map((q, idx) => ({
            ...q,
            position: idx,
          })),
        });
        setForm(result.form);
        // Update question IDs from server
        setQuestions(
          result.form.questions.map((q) => ({
            id: q.id,
            type: q.type,
            config: q.config,
            position: q.position,
            required: q.required,
            displayCondition: q.displayCondition,
          }))
        );
      } catch {
        // silently handle
      } finally {
        setSaving(false);
      }
    },
    [formId]
  );

  const debouncedSave = useCallback(
    (newTitle: string, newDesc: string, newQuestions: FormQuestionInput[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveForm(newTitle, newDesc, newQuestions);
      }, 800);
    },
    [saveForm]
  );

  const handleTitleChange = useCallback(
    (val: string) => {
      setTitle(val);
      debouncedSave(val, description, questions);
    },
    [description, questions, debouncedSave]
  );

  const handleDescriptionChange = useCallback(
    (val: string) => {
      setDescription(val);
      debouncedSave(title, val, questions);
    },
    [title, questions, debouncedSave]
  );

  const updateQuestions = useCallback(
    (newQuestions: FormQuestionInput[]) => {
      setQuestions(newQuestions);
      debouncedSave(title, description, newQuestions);
    },
    [title, description, debouncedSave]
  );

  const addQuestion = useCallback(
    (type: FormQuestionType) => {
      const newQ: FormQuestionInput = {
        type,
        config: { title: "", description: "" },
        position: questions.length,
        required: false,
        displayCondition: null,
      };
      if (type === "single_select" || type === "multi_choice") {
        newQ.config = { title: "", description: "", options: ["Option 1"] };
      }
      if (type === "rating") {
        newQ.config = { title: "", description: "", maxRating: 5 };
      }
      if (type === "nps") {
        newQ.config = { title: "", description: "", minLabel: "Not likely", maxLabel: "Very likely" };
      }
      const newQuestions = [...questions, newQ];
      setQuestions(newQuestions);
      setSelectedQuestionIdx(newQuestions.length - 1);
      setShowTypePicker(false);
      debouncedSave(title, description, newQuestions);
    },
    [questions, title, description, debouncedSave]
  );

  const removeQuestion = useCallback(
    (idx: number) => {
      const newQuestions = questions.filter((_, i) => i !== idx);
      setQuestions(newQuestions);
      if (selectedQuestionIdx === idx) setSelectedQuestionIdx(null);
      else if (selectedQuestionIdx !== null && selectedQuestionIdx > idx)
        setSelectedQuestionIdx(selectedQuestionIdx - 1);
      debouncedSave(title, description, newQuestions);
    },
    [questions, selectedQuestionIdx, title, description, debouncedSave]
  );

  const updateQuestion = useCallback(
    (idx: number, updates: Partial<FormQuestionInput>) => {
      const newQuestions = questions.map((q, i) =>
        i === idx ? { ...q, ...updates } : q
      );
      updateQuestions(newQuestions);
    },
    [questions, updateQuestions]
  );

  const updateQuestionConfig = useCallback(
    (idx: number, configUpdates: Record<string, unknown>) => {
      const q = questions[idx];
      updateQuestion(idx, {
        config: { ...(q.config || {}), ...configUpdates },
      });
    },
    [questions, updateQuestion]
  );

  // Drag and drop handlers
  const handleDragStart = useCallback((idx: number, e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }, []);

  const handleDragOver = useCallback(
    (idx: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragIdx !== null && idx !== dragIdx) {
        setDragOverIdx(idx);
      }
    },
    [dragIdx]
  );

  const handleDrop = useCallback(
    (targetIdx: number, e: React.DragEvent) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === targetIdx) {
        setDragIdx(null);
        setDragOverIdx(null);
        return;
      }
      const newQuestions = [...questions];
      const [moved] = newQuestions.splice(dragIdx, 1);
      newQuestions.splice(targetIdx, 0, moved);
      updateQuestions(newQuestions);
      if (selectedQuestionIdx === dragIdx) setSelectedQuestionIdx(targetIdx);
      setDragIdx(null);
      setDragOverIdx(null);
    },
    [dragIdx, questions, selectedQuestionIdx, updateQuestions]
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  // Load responses
  useEffect(() => {
    if (activeTab === "responses") {
      setResponsesLoading(true);
      api
        .getFormResponses(formId, { limit: 100 })
        .then((result) => setResponses(result.responses))
        .catch(() => {})
        .finally(() => setResponsesLoading(false));
    }
  }, [activeTab, formId]);

  const formUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/forms/${formId}/view`
      : "";

  const handleCopyLink = useCallback(() => {
    if (formUrl) {
      navigator.clipboard.writeText(formUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  }, [formUrl]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </AppShell>
    );
  }

  if (!form) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Form not found
        </div>
      </AppShell>
    );
  }

  const tabs: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "builder", label: "Builder", icon: Pencil },
    { id: "preview", label: "Preview", icon: Eye },
    { id: "responses", label: "Responses", icon: BarChart3 },
    { id: "share", label: "Share", icon: Share2 },
  ];

  return (
    <AppShell>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="text-lg font-semibold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 flex-1 min-w-0"
            placeholder="Form title..."
          />
          <div className="flex items-center gap-1 text-xs text-gray-400">
            {saving && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "responses" && responses.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-full">
                  {responses.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          {activeTab === "builder" && (
            <BuilderTab
              description={description}
              onDescriptionChange={handleDescriptionChange}
              questions={questions}
              selectedIdx={selectedQuestionIdx}
              onSelectQuestion={setSelectedQuestionIdx}
              onAddQuestion={addQuestion}
              onRemoveQuestion={removeQuestion}
              onUpdateQuestion={updateQuestion}
              onUpdateQuestionConfig={updateQuestionConfig}
              showTypePicker={showTypePicker}
              onToggleTypePicker={setShowTypePicker}
              dragIdx={dragIdx}
              dragOverIdx={dragOverIdx}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          )}
          {activeTab === "preview" && (
            <PreviewTab
              title={title}
              description={description}
              questions={questions}
            />
          )}
          {activeTab === "responses" && (
            <ResponsesTab
              questions={questions}
              responses={responses}
              loading={responsesLoading}
              expandedId={expandedResponseId}
              onToggleExpand={setExpandedResponseId}
            />
          )}
          {activeTab === "share" && (
            <ShareTab
              formUrl={formUrl}
              copiedLink={copiedLink}
              onCopyLink={handleCopyLink}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ============ Builder Tab ============

function BuilderTab({
  description,
  onDescriptionChange,
  questions,
  selectedIdx,
  onSelectQuestion,
  onAddQuestion,
  onRemoveQuestion,
  onUpdateQuestion,
  onUpdateQuestionConfig,
  showTypePicker,
  onToggleTypePicker,
  dragIdx,
  dragOverIdx,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  description: string;
  onDescriptionChange: (val: string) => void;
  questions: FormQuestionInput[];
  selectedIdx: number | null;
  onSelectQuestion: (idx: number | null) => void;
  onAddQuestion: (type: FormQuestionType) => void;
  onRemoveQuestion: (idx: number) => void;
  onUpdateQuestion: (idx: number, updates: Partial<FormQuestionInput>) => void;
  onUpdateQuestionConfig: (idx: number, config: Record<string, unknown>) => void;
  showTypePicker: boolean;
  onToggleTypePicker: (show: boolean) => void;
  dragIdx: number | null;
  dragOverIdx: number | null;
  onDragStart: (idx: number, e: React.DragEvent) => void;
  onDragOver: (idx: number, e: React.DragEvent) => void;
  onDrop: (idx: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="flex gap-6 p-6 max-w-5xl mx-auto">
      {/* Question list */}
      <div className="flex-1 space-y-3">
        {/* Form description */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Form Description
          </label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            className="w-full text-sm bg-transparent border-none outline-none resize-none text-gray-900 dark:text-gray-100"
            rows={2}
            placeholder="Add a description..."
          />
        </div>

        {/* Questions */}
        {questions.map((q, idx) => {
          const typeInfo = getQuestionTypeInfo(q.type);
          const Icon = typeInfo.icon;
          const config = (q.config || {}) as Record<string, unknown>;
          const isSelected = selectedIdx === idx;
          const isDragging = dragIdx === idx;
          const isDragOver = dragOverIdx === idx;

          return (
            <div
              key={idx}
              draggable
              onDragStart={(e) => onDragStart(idx, e)}
              onDragOver={(e) => onDragOver(idx, e)}
              onDrop={(e) => onDrop(idx, e)}
              onDragEnd={onDragEnd}
              onClick={() => onSelectQuestion(idx)}
              className={cn(
                "bg-white dark:bg-gray-800 rounded-lg border transition-all cursor-pointer group",
                isSelected
                  ? "border-blue-500 ring-1 ring-blue-500/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                isDragging && "opacity-50",
                isDragOver &&
                  "border-blue-400 border-dashed"
              )}
            >
              <div className="flex items-start gap-2 p-4">
                <div className="flex items-center gap-1 pt-1">
                  <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600 cursor-grab" />
                  <span className="text-xs text-gray-400 w-5 text-center">
                    {idx + 1}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {typeInfo.label}
                    </span>
                    {q.required && (
                      <span className="text-xs text-red-500">Required</span>
                    )}
                    {q.displayCondition && (
                      <span className="text-xs text-purple-500">Conditional</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {(config.title as string) || "Untitled question"}
                  </p>
                  {typeof config.description === "string" && config.description && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {config.description}
                    </p>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveQuestion(idx);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-opacity"
                >
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add question button */}
        <div className="relative">
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={() => onToggleTypePicker(!showTypePicker)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Question
          </Button>

          {showTypePicker && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 p-2 grid grid-cols-2 gap-1">
              {QUESTION_TYPES.map((qt) => (
                <button
                  key={qt.type}
                  onClick={() => onAddQuestion(qt.type)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <qt.icon className="w-4 h-4 text-gray-400" />
                  {qt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Question config panel */}
      <div className="w-80 shrink-0">
        {selectedIdx !== null && selectedIdx < questions.length ? (
          <QuestionConfigPanel
            question={questions[selectedIdx]}
            questionIdx={selectedIdx}
            totalQuestions={questions.length}
            allQuestions={questions}
            onUpdate={(updates) => onUpdateQuestion(selectedIdx, updates)}
            onUpdateConfig={(config) =>
              onUpdateQuestionConfig(selectedIdx, config)
            }
            onClose={() => onSelectQuestion(null)}
          />
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-400">
            <Settings className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            Select a question to configure
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Question Config Panel ============

function QuestionConfigPanel({
  question,
  questionIdx,
  totalQuestions,
  allQuestions,
  onUpdate,
  onUpdateConfig,
  onClose,
}: {
  question: FormQuestionInput;
  questionIdx: number;
  totalQuestions: number;
  allQuestions: FormQuestionInput[];
  onUpdate: (updates: Partial<FormQuestionInput>) => void;
  onUpdateConfig: (config: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const config = (question.config || {}) as Record<string, unknown>;
  const options = (config.options as string[]) || [];
  const displayCondition = question.displayCondition as Record<string, unknown> | null;

  const [showCondition, setShowCondition] = useState(!!displayCondition);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Question {questionIdx + 1}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Question Title
          </label>
          <Input
            value={(config.title as string) || ""}
            onChange={(e) => onUpdateConfig({ title: e.target.value })}
            placeholder="Enter question..."
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Description
          </label>
          <textarea
            value={(config.description as string) || ""}
            onChange={(e) => onUpdateConfig({ description: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none"
            rows={2}
            placeholder="Optional description..."
          />
        </div>

        {/* Required toggle */}
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={question.required || false}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            className="rounded border-gray-300"
          />
          Required
        </label>

        {/* Options for select types */}
        {(question.type === "single_select" ||
          question.type === "multi_choice") && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Options
            </label>
            <div className="space-y-2">
              {options.map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const newOptions = [...options];
                      newOptions[optIdx] = e.target.value;
                      onUpdateConfig({ options: newOptions });
                    }}
                    placeholder={`Option ${optIdx + 1}`}
                    className="flex-1"
                  />
                  <button
                    onClick={() => {
                      const newOptions = options.filter(
                        (_, i) => i !== optIdx
                      );
                      onUpdateConfig({ options: newOptions });
                    }}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onUpdateConfig({
                    options: [...options, `Option ${options.length + 1}`],
                  })
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Option
              </Button>
            </div>
          </div>
        )}

        {/* Rating config */}
        {question.type === "rating" && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Max Rating
            </label>
            <Input
              type="number"
              min={1}
              max={10}
              value={(config.maxRating as number) || 5}
              onChange={(e) =>
                onUpdateConfig({ maxRating: Number(e.target.value) })
              }
            />
          </div>
        )}

        {/* NPS config */}
        {question.type === "nps" && (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Min Label
              </label>
              <Input
                value={(config.minLabel as string) || ""}
                onChange={(e) => onUpdateConfig({ minLabel: e.target.value })}
                placeholder="Not likely"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Max Label
              </label>
              <Input
                value={(config.maxLabel as string) || ""}
                onChange={(e) => onUpdateConfig({ maxLabel: e.target.value })}
                placeholder="Very likely"
              />
            </div>
          </div>
        )}

        {/* Conditional display */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            onClick={() => {
              if (showCondition) {
                onUpdate({ displayCondition: null });
                setShowCondition(false);
              } else {
                setShowCondition(true);
              }
            }}
            className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          >
            {showCondition ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Conditional Display
          </button>

          {showCondition && (
            <div className="mt-3 space-y-2 pl-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Show when question
                </label>
                <select
                  value={
                    (displayCondition?.dependsOn as string) || ""
                  }
                  onChange={(e) =>
                    onUpdate({
                      displayCondition: {
                        ...(displayCondition || {}),
                        dependsOn: e.target.value,
                      },
                    })
                  }
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select a question...</option>
                  {allQuestions.map((pq, pIdx) => {
                    if (pIdx >= questionIdx) return null;
                    const pConfig = (pq.config || {}) as Record<string, unknown>;
                    return (
                      <option key={pIdx} value={pq.id || `q-${pIdx}`}>
                        Q{pIdx + 1}: {(pConfig.title as string) || "Untitled"}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Equals value
                </label>
                <Input
                  value={
                    (displayCondition?.value as string) || ""
                  }
                  onChange={(e) =>
                    onUpdate({
                      displayCondition: {
                        ...(displayCondition || {}),
                        value: e.target.value,
                      },
                    })
                  }
                  placeholder="Expected value..."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ Preview Tab ============

function PreviewTab({
  title,
  description,
  questions,
}: {
  title: string;
  description: string;
  questions: FormQuestionInput[];
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleChange = useCallback((questionIdx: number, value: unknown) => {
    setFormData((prev) => ({ ...prev, [`q-${questionIdx}`]: value }));
  }, []);

  // Evaluate display conditions
  const isQuestionVisible = useCallback(
    (q: FormQuestionInput, idx: number) => {
      if (!q.displayCondition) return true;
      const cond = q.displayCondition as Record<string, unknown>;
      const dependsOn = cond.dependsOn as string;
      const expectedValue = cond.value;
      if (!dependsOn) return true;
      // Find the question index this depends on
      const depIdx = questions.findIndex(
        (pq, pIdx) => (pq.id || `q-${pIdx}`) === dependsOn
      );
      if (depIdx === -1) return true;
      return formData[`q-${depIdx}`] === expectedValue;
    },
    [questions, formData]
  );

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-gray-900 dark:text-gray-100 font-medium">
            Response submitted successfully!
          </p>
          <p className="text-xs text-gray-500 mt-2">
            This is a preview. No data was saved.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFormData({});
              setSubmitted(false);
            }}
            className="mt-4"
          >
            Reset Preview
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title || "Untitled Form"}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>

        <div className="px-6 py-4 space-y-5">
          {questions.map((q, idx) => {
            if (!isQuestionVisible(q, idx)) return null;
            const config = (q.config || {}) as Record<string, unknown>;
            const qTitle = (config.title as string) || `Question ${idx + 1}`;

            return (
              <div key={idx}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {qTitle}
                  {q.required && (
                    <span className="text-red-500 ml-0.5">*</span>
                  )}
                </label>
                {typeof config.description === "string" && config.description && (
                  <p className="text-xs text-gray-500 mb-1.5">
                    {config.description}
                  </p>
                )}
                <PreviewField
                  question={q}
                  value={formData[`q-${idx}`]}
                  onChange={(val) => handleChange(idx, val)}
                />
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <Button onClick={() => setSubmitted(true)}>Submit</Button>
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
  question: FormQuestionInput;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const config = (question.config || {}) as Record<string, unknown>;

  switch (question.type) {
    case "text":
      return (
        <Input
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer..."
        />
      );

    case "number":
      return (
        <Input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : null)
          }
          placeholder="0"
        />
      );

    case "date":
      return (
        <Input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case "single_select": {
      const options = (config.options as string[]) || [];
      return (
        <div className="space-y-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`preview-${question.id || "q"}`}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="border-gray-300"
              />
              <span className="text-gray-700 dark:text-gray-300">{opt}</span>
            </label>
          ))}
        </div>
      );
    }

    case "multi_choice": {
      const options = (config.options as string[]) || [];
      const selected = (value as string[]) || [];
      return (
        <div className="space-y-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
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
                className="rounded border-gray-300"
              />
              <span className="text-gray-700 dark:text-gray-300">{opt}</span>
            </label>
          ))}
        </div>
      );
    }

    case "rating": {
      const max = (config.maxRating as number) || 5;
      const currentVal = (value as number) || 0;
      return (
        <div className="flex gap-1">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                "w-10 h-10 rounded-md border text-sm font-medium transition-colors",
                n <= currentVal
                  ? "bg-yellow-400 border-yellow-400 text-white"
                  : "border-gray-300 dark:border-gray-600 text-gray-400 hover:border-yellow-300"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }

    case "nps": {
      const currentVal = value as number | undefined;
      return (
        <div>
          <div className="flex gap-1">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={cn(
                  "w-9 h-9 rounded text-xs font-medium border transition-colors",
                  currentVal === n
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-300"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">
              {(config.minLabel as string) || "Not likely"}
            </span>
            <span className="text-xs text-gray-400">
              {(config.maxLabel as string) || "Very likely"}
            </span>
          </div>
        </div>
      );
    }

    case "location":
      return (
        <Input
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter location..."
        />
      );

    case "person":
      return (
        <Input
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter name or email..."
        />
      );

    case "file":
      return (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md p-6 text-center text-sm text-gray-400">
          <FileUp className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          Click or drag to upload
        </div>
      );

    default:
      return (
        <Input
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer..."
        />
      );
  }
}

// ============ Responses Tab ============

function ResponsesTab({
  questions,
  responses,
  loading,
  expandedId,
  onToggleExpand,
}: {
  questions: FormQuestionInput[];
  responses: FormResponseInfo[];
  loading: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 text-sm">No responses yet</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                #
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                Submitted
              </th>
              {questions.slice(0, 4).map((q, idx) => {
                const config = (q.config || {}) as Record<string, unknown>;
                return (
                  <th
                    key={idx}
                    className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase truncate max-w-[150px]"
                  >
                    {(config.title as string) || `Q${idx + 1}`}
                  </th>
                );
              })}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {responses.map((resp, rIdx) => {
              const answers = resp.answers as Record<string, unknown>;
              const isExpanded = expandedId === resp.id;

              return (
                <React.Fragment key={resp.id}>
                  <tr
                    onClick={() =>
                      onToggleExpand(isExpanded ? null : resp.id)
                    }
                    className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-gray-500">{rIdx + 1}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                      {new Date(resp.submittedAt).toLocaleString()}
                    </td>
                    {questions.slice(0, 4).map((q, idx) => {
                      const val = answers[q.id || `q-${idx}`];
                      return (
                        <td
                          key={idx}
                          className="px-4 py-3 text-gray-700 dark:text-gray-300 truncate max-w-[150px]"
                        >
                          {val !== undefined && val !== null
                            ? Array.isArray(val)
                              ? val.join(", ")
                              : String(val)
                            : "-"}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td
                        colSpan={questions.slice(0, 4).length + 3}
                        className="bg-gray-50 dark:bg-gray-800/30 px-8 py-4"
                      >
                        <div className="space-y-3">
                          {questions.map((q, idx) => {
                            const config = (q.config || {}) as Record<
                              string,
                              unknown
                            >;
                            const qTitle =
                              (config.title as string) || `Question ${idx + 1}`;
                            const val = answers[q.id || `q-${idx}`];
                            return (
                              <div key={idx}>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                  {qTitle}
                                </p>
                                <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                                  {val !== undefined && val !== null
                                    ? Array.isArray(val)
                                      ? val.join(", ")
                                      : String(val)
                                    : "-"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Share Tab ============

function ShareTab({
  formUrl,
  copiedLink,
  onCopyLink,
}: {
  formUrl: string;
  copiedLink: boolean;
  onCopyLink: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Share Form
        </h3>

        {/* Copy link */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Form Link
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700">
              <LinkIcon className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {formUrl}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={onCopyLink}>
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* QR Code */}
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            QR Code
          </label>
          <div className="flex items-center justify-center p-6 bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700">
            <QrCodeDisplay value={formUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple QR code display using a canvas-based SVG approach
function QrCodeDisplay({ value }: { value: string }) {
  // Generate a simple visual QR representation
  // In production, you'd use a library like qrcode.react
  const size = 160;
  const cellSize = 4;
  const cells = Math.floor(size / cellSize);

  // Simple hash-based pattern for visual representation
  const pattern: boolean[][] = [];
  for (let y = 0; y < cells; y++) {
    pattern[y] = [];
    for (let x = 0; x < cells; x++) {
      // QR-like corner patterns
      const inCorner =
        (x < 7 && y < 7) ||
        (x >= cells - 7 && y < 7) ||
        (x < 7 && y >= cells - 7);
      const onCornerBorder =
        inCorner &&
        (x === 0 || x === 6 || y === 0 || y === 6 ||
          x === cells - 7 || x === cells - 1 || y === cells - 7 || y === cells - 1 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
          (x >= cells - 5 && x <= cells - 3 && y >= 2 && y <= 4) ||
          (x >= 2 && x <= 4 && y >= cells - 5 && y <= cells - 3));
      if (inCorner) {
        pattern[y][x] = onCornerBorder;
      } else {
        // Data pattern based on hash of value + position
        const hash = ((value.charCodeAt((x + y * 3) % value.length) || 0) * 31 + x * 7 + y * 13) % 100;
        pattern[y][x] = hash < 40;
      }
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" />
      {pattern.map((row, y) =>
        row.map((cell, x) =>
          cell ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="black"
            />
          ) : null
        )
      )}
    </svg>
  );
}

// Need React import for React.Fragment in ResponsesTab
import React from "react";
