import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { ComponentPropsWithoutRef } from "react";
import {vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyButton } from "./CopyButton";
import type { UIMessage } from "ai";

interface ChatMessageProps {
  message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {

  const textContent = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");

  return (
    <div
      className={cn(
        "flex",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "group relative max-w-[80%] px-3 py-2 text-xs rounded-lg",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        )}
      >
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <CopyButton
            content={textContent}
            className={cn(
              "text-muted-foreground bg-background/50 backdrop-blur-sm",
              message.role === "user" &&
                "text-primary-foreground bg-primary-foreground/20"
            )}
          />
        </div>

        {message.parts.map((part, index) => {
          if (part.type !== "text") return null;

          return (
            <div
              key={`${message.id}-part-${index}`}
              className="prose prose-xs dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            >
              <ReactMarkdown
                components={{
                  code(props: ComponentPropsWithoutRef<"code"> & { node?: unknown }) {
                    const { children, className, node, ...rest } = props;
                    const match = /language-(\w+)/.exec(className || "");
                    const content = String(children).replace(/\n$/, "");
                    const isInline = !match && !content.includes("\n");

                    if (isInline) {
                      return (
                        <code
                          className={cn(
                            "bg-muted-foreground/20 px-1 py-0.5 rounded font-mono",
                            className
                          )}
                          {...rest}
                        >
                          {children}
                        </code>
                      );
                    }

                    return (
                      <div className="relative group/code my-2 rounded-md overflow-hidden border border-border">
                        <div className="absolute right-2 top-2 z-10 opacity-0 group-hover/code:opacity-100 transition-opacity">
                          <CopyButton
                            content={content}
                            className="bg-muted text-foreground hover:bg-muted/80"
                          />
                        </div>
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match?.[1] || "text"}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: "1rem",
                            fontSize: "0.8rem",
                            lineHeight: "1.4",
                          }}
                          codeTagProps={{
                            style: { fontFamily: "inherit" },
                          }}
                        >
                          {content}
                        </SyntaxHighlighter>
                      </div>
                    );
                  },
                }}
              >
                {part.text}
              </ReactMarkdown>
            </div>
          );
        })}
      </div>
    </div>
  );
}
