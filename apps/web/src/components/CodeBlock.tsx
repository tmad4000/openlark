"use client";

import { NodeViewContent, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, Copy, Check } from "lucide-react";

// Supported languages for the dropdown
export const CODE_LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "csharp", label: "C#" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "scala", label: "Scala" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "XML" },
  { value: "markdown", label: "Markdown" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
  { value: "shell", label: "Shell" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "plaintext", label: "Plain Text" },
];

export function CodeBlockNode({ node, updateAttributes, extension }: NodeViewProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedLanguage = node.attrs.language || "plaintext";
  const selectedLabel = CODE_LANGUAGES.find((l) => l.value === selectedLanguage)?.label || selectedLanguage;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  const handleCopy = useCallback(() => {
    const content = node.textContent;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [node]);

  const handleLanguageSelect = useCallback(
    (language: string) => {
      updateAttributes({ language });
      setShowDropdown(false);
    },
    [updateAttributes]
  );

  return (
    <NodeViewWrapper className="relative my-2">
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        {/* Header with language selector and copy button */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
          {/* Language selector */}
          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              contentEditable={false}
            >
              <span>{selectedLabel}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 mt-1 w-40 max-h-60 overflow-y-auto bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50"
                contentEditable={false}
              >
                {CODE_LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => handleLanguageSelect(lang.value)}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      lang.value === selectedLanguage
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-white transition-colors"
            contentEditable={false}
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-400" />
                <span className="text-green-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Code content */}
        <pre className="p-3 text-sm text-gray-100 overflow-x-auto">
          <NodeViewContent<"code"> as="code" className={`language-${selectedLanguage}`} />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
