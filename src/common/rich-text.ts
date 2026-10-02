import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateBy } from 'class-validator';
import sanitizeHtml from 'sanitize-html';

// Room and venue descriptions are written in the dashboard's Quill editor and
// rendered as HTML on the guest site, so whatever reaches the database must be
// safe to inject. This list is what the editor's toolbar can produce — anything
// else (scripts, styles, event handlers, images) is stripped on the way in.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h2',
    'h3',
    'strong',
    'em',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    // Links open in a new tab and pass no referrer or window handle.
    a: sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer',
    }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

// What a guest actually reads, for length limits: markup does not count.
export function plainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sanitises, then bounds the visible text to [min, max] characters. The raw
// HTML gets a looser cap so heavy formatting cannot bloat a document.
export function IsRichText(min: number, max: number) {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? sanitizeRichText(value) : value,
    ),
    IsString(),
    MaxLength(max * 5),
    ValidateBy({
      name: 'richTextLength',
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') return false;
          const length = plainText(value).length;
          return length >= min && length <= max;
        },
        defaultMessage: (args) =>
          `${args?.property} must have between ${min} and ${max} characters of text`,
      },
    }),
  );
}
