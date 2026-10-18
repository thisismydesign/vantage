import type { Rule, SourceCode } from "eslint";

// Arbitrary line breaks make edits require reflowing text and read awkwardly in narrow panels. Editor wrapping adapts to each reader's width and preferences. Sentence boundaries, lists, annotations, directives, diagrams and commented-out code remain allowed.

type Comment = ReturnType<SourceCode["getAllComments"]>[number];
type Line = { body: string; start: number; end: number };

const NOT_PROSE =
  /^(?:[-*>|[<#!]|\d+[.)]|@\w|(?:eslint|eslint-disable|eslint-enable|global|prettier-ignore)\b|\w+:(?:\S|$)|[\w-]+\s+[—–]\s|https?:\/\/)|\S {2,}\S/;
const CODE =
  /[{}]|=>|\s=\s|\w\.\w+\(|^(?:if|for|while|switch)\s*\(|^(?:import|export|return|const|let|var|function)\s.*[=(;]/;

const prose = (body: string) =>
  body.trim() !== "" && !/^\s/.test(body) && !NOT_PROSE.test(body) && !CODE.test(body);
const sentenceEnd = (body: string) => /[.!?:]["'’”)\]]*\s*$/.test(body);

// Each line's text with its source range; the comment marker and one space are not part of the body.
function lines(comment: Comment): Line[] {
  const [from, to] = comment.range!;
  if (comment.type === "Line") {
    const marker = /^\/*\s?/.exec(comment.value)![0].length;
    return [{ body: comment.value.slice(marker), start: from + 2 + marker, end: to }];
  }
  let offset = from + 2;
  return comment.value.split("\n").map((text, i) => {
    const marker = (i === 0 ? /^\*?\s?/ : /^\s*(?:\*\s?)?/).exec(text)![0].length;
    const line = { body: text.slice(marker), start: offset + marker, end: offset + text.length };
    offset += text.length + 1;
    return line;
  });
}

const ownLine = (comment: Comment, source: SourceCode) =>
  source.lines[comment.loc!.start.line - 1].slice(0, comment.loc!.start.column).trim() === "";

const rule: Rule.RuleModule = {
  meta: {
    type: "layout",
    fixable: "whitespace",
    messages: {
      wrapped:
        "Avoid arbitrary line breaks within a comment sentence; let the editor wrap it. Separate sentences and lists may use separate lines.",
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode;
    const check = (previous: Line, next: Line) => {
      if (!prose(previous.body) || !prose(next.body) || sentenceEnd(previous.body)) return;
      context.report({
        loc: { start: source.getLocFromIndex(next.start), end: source.getLocFromIndex(next.end) },
        messageId: "wrapped",
        fix: (fixer) =>
          fixer.replaceTextRange(
            [previous.start + previous.body.trimEnd().length, next.start],
            " ",
          ),
      });
    };
    return {
      Program() {
        const comments = source.getAllComments();
        comments.forEach((comment, i) => {
          if (comment.type === "Block") {
            const body = lines(comment);
            body.slice(1).forEach((line, j) => check(body[j], line));
            return;
          }
          const previous = comments[i - 1];
          if (
            previous?.type === "Line" &&
            previous.loc!.end.line + 1 === comment.loc!.start.line &&
            ownLine(previous, source) &&
            ownLine(comment, source)
          )
            check(lines(previous)[0], lines(comment)[0]);
        });
      },
    };
  },
};

export default rule;
