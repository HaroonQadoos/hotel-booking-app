import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsRichText, plainText, sanitizeRichText } from './rich-text';

class Probe {
  @IsRichText(10, 50)
  description!: string;
}

function check(description: unknown) {
  const probe = plainToInstance(Probe, { description });
  return { probe, errors: validateSync(probe) };
}

describe('sanitizeRichText', () => {
  it('keeps the formatting the editor produces', () => {
    const html =
      '<h2>Views</h2><p><strong>Big</strong> <em>windows</em></p><ul><li>Bath</li></ul>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('strips scripts, event handlers and inline styles', () => {
    expect(
      sanitizeRichText(
        '<p onclick="steal()" style="color:red">Hi</p><script>steal()</script><img src=x onerror=steal()>',
      ),
    ).toBe('<p>Hi</p>');
  });

  it('drops javascript: links and makes the rest open safely', () => {
    expect(sanitizeRichText('<a href="javascript:steal()">x</a>')).toBe(
      '<a target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeRichText('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it('leaves a plain-text description unchanged', () => {
    expect(sanitizeRichText('A quiet room on the top floor.')).toBe(
      'A quiet room on the top floor.',
    );
  });
});

describe('plainText', () => {
  it('counts only what a guest reads', () => {
    expect(plainText('<p><strong>Big</strong>&nbsp;room</p><p></p>')).toBe(
      'Big room',
    );
  });
});

describe('IsRichText', () => {
  it('sanitises the value it validates', () => {
    const { probe, errors } = check('<p>A lovely room<script>x</script></p>');
    expect(errors).toHaveLength(0);
    expect(probe.description).toBe('<p>A lovely room</p>');
  });

  it('measures length without markup', () => {
    // Long as HTML, but only three characters of text.
    expect(check('<p><strong><em>Hi!</em></strong></p>').errors).toHaveLength(
      1,
    );
    expect(check('<p><br></p>').errors).toHaveLength(1);
    expect(check(`<p>${'a'.repeat(51)}</p>`).errors).toHaveLength(1);
  });

  it('rejects a non-string', () => {
    expect(check(42).errors).toHaveLength(1);
  });
});
