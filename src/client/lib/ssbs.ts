/**
 * The SSBS class: a private study course (West and Central Africa, grade 6) that ships in the build but stays
 * hidden. `?ssbs=1` turns it on and remembers that on this device; `?ssbs=0` turns it off again.
 */
import { load, save } from './storage.ts';

const fromLink = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('ssbs');
if (fromLink === '1' || fromLink === '0') save('ssbs', fromLink === '1');

export const ssbsOn = (): boolean => load<boolean>('ssbs', false);

/** A link straight into an SSBS lesson (or the SSBS lesson list), with the class turned on. */
export const ssbsLink = (id?: string): string => `${location.origin}${location.pathname}?ssbs=1#${id ? `lesson/${id}` : 'ssbs'}`;
