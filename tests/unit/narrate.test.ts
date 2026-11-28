import { describe, it, expect } from 'vitest';
import { cycleNarrationRate, splitSentences, getNarrationRate, setNarrationRate } from '../../src/client/lib/narrate.ts';
import { cleanWikiText, formatWikiStudyMarkdown, parseExtract } from '../../src/client/lib/wikipedia.ts';
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

  it('persists, clamps, and cycles narration rate presets', () => {
    expect(setNarrationRate(1.25)).toBe(1.25);
    expect(getNarrationRate()).toBe(1.25);
    expect(cycleNarrationRate()).toBe(0.8);
    expect(cycleNarrationRate()).toBe(1);
    expect(cycleNarrationRate()).toBe(1.25);
    expect(setNarrationRate(9)).toBe(2);
    expect(setNarrationRate(0.1)).toBe(0.5);
    setNarrationRate(1);
  });

  it('shields scientific and historical abbreviations inside sentences', () => {
    expect(splitSentences('Smith et al. measured elev. 4200 m on Quercus sp. in 320 B.C.E. Amazing!'))
      .toEqual(['Smith et al. measured elev. 4200 m on Quercus sp. in 320 B.C.E.', 'Amazing!']);
  });
});

describe('wikipedia extract cleanup, markdown export & classroom links', () => {
  it('strips empty pronunciation parentheses, listen/citation tags, and LaTeX displaystyle artifacts', () => {
    expect(cleanWikiText('Paris ( ; ) is the capital ( , ) of France.')).toBe('Paris is the capital of France.');
    expect(cleanWikiText('Paris (, French: Paris (listen))[citation needed] is historic.')).toBe('Paris (French: Paris) is historic.');
    expect(cleanWikiText('Energy follows {\\displaystyle E=mc^{2}} in physics.')).toBe('Energy follows E=mc^{2} in physics.');
    const parsed = parseExtract('Mount Everest ( ) is Earth\'s highest mountain.\n== Geography ==\nLocated in the Mahalangur Himal.\n== References ==\n1. Foo');
    expect(parsed.lead).toEqual(["Mount Everest is Earth's highest mountain."]);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toBe('Geography');
    const md = formatWikiStudyMarkdown({
      lang: 'en',
      title: 'Mount Everest',
      url: 'https://en.wikipedia.org/wiki/Mount_Everest',
      description: 'Highest mountain on Earth',
      lead: parsed.lead,
      sections: parsed.sections,
      words: parsed.words,
    }, 'https://terrastra.example/landmarks/mount-everest/');
    expect(md).toContain('# Mount Everest');
    expect(md).toContain('## Geography');
    expect(md).toContain('CC BY-SA 4.0');
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
