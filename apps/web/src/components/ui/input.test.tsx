import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "./input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input aria-label="test-input" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("handles value changes", () => {
    const handleChange = vi.fn();
    render(<Input aria-label="test-input" onChange={handleChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    expect(handleChange).toHaveBeenCalled();
  });

  it("respects type prop", () => {
    render(<Input type="email" aria-label="email-input" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
  });

  it("can be disabled", () => {
    render(<Input disabled aria-label="disabled-input" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("accepts placeholder", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("accepts custom className", () => {
    render(<Input className="custom-class" aria-label="styled-input" />);
    expect(screen.getByRole("textbox")).toHaveClass("custom-class");
  });

  it("supports required attribute", () => {
    render(<Input required aria-label="required-input" />);
    expect(screen.getByRole("textbox")).toBeRequired();
  });
});
