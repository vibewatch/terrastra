import { describe, it, expect } from 'vitest';
import { splitSentences, getNarrationRate, setNarrationRate } from '../../src/client/lib/narrate.ts';
import { cleanWikiText, parseExtract } from '../../src/client/lib/wikipedia.ts';
import { classroomLink } from '../../src/client/lib/classroom.ts';

describe('narration sentences & speed', () => {
  it('splits English and Chinese at sentence ends, not inside numbers or abbreviations', () => {
    expect(splitSentences('It is 3.5 m tall. Wow! Really?')).toEqual(['It is 3.5 m tall.', 'Wow!', 'Really?']);
    expect(splitSentences('高 828 米。是世界最高的楼！你知道吗？')).toEqual(['高 828 米。', '是世界最高的楼！', '你知道吗？']);
    expect(splitSentences('No full stop')).toEqual(['No full stop']);
    expect(splitSentences('Mt. Everest and St. Helens were studied by Dr. A. J. Smith in the U.S. State Park. Next sentence!'))
      .toEqual([
        'Mt. Everest and St. Helens were studied by Dr. A. J. Smith in the U.S. State Park.',
        'Next sentence!',
      ]);
  });

  it('persists and clamps narration rate between 0.5x and 2x', () => {
    expect(setNarrationRate(1.25)).toBe(1.25);
    expect(getNarrationRate()).toBe(1.25);
    expect(setNarrationRate(9)).toBe(2);
    expect(setNarrationRate(0.1)).toBe(0.5);
    setNarrationRate(1);
  });
});

describe('wikipedia extract cleanup & classroom links', () => {
  it('strips empty pronunciation parentheses and LaTeX displaystyle artifacts', () => {
    expect(cleanWikiText('Paris ( ; ) is the capital ( , ) of France.')).toBe('Paris is the capital of France.');
    expect(cleanWikiText('Energy follows {\\displaystyle E=mc^{2}} in physics.')).toBe('Energy follows E=mc^{2} in physics.');
    const parsed = parseExtract('Mount Everest ( ) is Earth\'s highest mountain.\n== Geography ==\nLocated in the Mahalangur Himal.\n== References ==\n1. Foo');
    expect(parsed.lead).toEqual(["Mount Everest is Earth's highest mountain."]);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toBe('Geography');
  });

  it('builds SSR-safe classroom links with optional still-frame and lang params', () => {
    expect(classroomLink('earth-shape', 'lesson')).toContain('?class=1#lesson/earth-shape');
    const paused = classroomLink('ring-of-fire', 'tour', { still: true, lang: 'zh' });
    expect(paused).toContain('class=1');
    expect(paused).toContain('still=1');
    expect(paused).toContain('lang=zh');
    expect(paused).toContain('#tour/ring-of-fire');
  });
});
