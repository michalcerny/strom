/**
 * "Whole family": familyHeadOf picks the head of a person's family — of their
 * topmost ancestors, the one with the most blood descendants, so focusing it
 * with every generation down shows the most of the family at once.
 */

import { describe, it, expect } from 'vitest';
import { familyHeadOf } from '../generations.js';
import { StromData, PersonId, PartnershipId, Person } from '../types.js';

/** A tiny tree from couples: [person1, person2, children]. */
function tree(couples: [string, string, string[]][], placeholders: string[] = []): StromData {
    const persons: Record<string, Person> = {};
    const partnerships: StromData['partnerships'] = {};
    const person = (id: string): Person => {
        persons[id] ??= {
            id: id as PersonId, firstName: id, lastName: '', gender: 'male',
            isPlaceholder: placeholders.includes(id), partnerships: [], parentIds: [], childIds: [],
        } as unknown as Person;
        return persons[id];
    };
    couples.forEach(([a, b, kids], i) => {
        const unionId = `u${i}` as PartnershipId;
        partnerships[unionId] = {
            id: unionId, person1Id: a as PersonId, person2Id: b as PersonId,
            childIds: kids as PersonId[], status: 'married',
        } as StromData['partnerships'][PartnershipId];
        for (const parent of [person(a), person(b)]) {
            parent.partnerships.push(unionId);
            parent.childIds.push(...(kids as PersonId[]));
        }
        for (const kid of kids) person(kid).parentIds.push(a as PersonId, b as PersonId);
    });
    return { persons, partnerships } as unknown as StromData;
}

describe('familyHeadOf', () => {
    // Father's line: great-grandparents → grandfather + his brother (3 children)
    // → father → focus. Mother's line: her parents only, she is an only child.
    const family = tree([
        ['ggf', 'ggm', ['gf', 'gfBrother']],
        ['gfBrother', 'gfBrotherWife', ['c1', 'c2', 'c3']],
        ['gf', 'gm', ['dad', 'aunt']],
        ['mgf', 'mgm', ['mom']],
        ['dad', 'mom', ['focus', 'sister']],
    ]);

    it('picks the topmost ancestor with the most descendants', () => {
        expect(familyHeadOf(family, 'focus' as PersonId)).toBe('ggf');
    });

    it('gives siblings the same head', () => {
        expect(familyHeadOf(family, 'sister' as PersonId)).toBe('ggf');
    });

    it('stays on a person who has no recorded parents', () => {
        expect(familyHeadOf(family, 'ggm' as PersonId)).toBe('ggm');
    });

    it('prefers more descendants over more generations up', () => {
        // The mother's line reaches further up but holds only a chain.
        const deepChain = tree([
            ['m5a', 'm5b', ['m4']],
            ['m4', 'm4w', ['m3']],
            ['m3', 'm3w', ['mgf']],
            ['mgf', 'mgm', ['mom']],
            ['gf', 'gm', ['dad', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']],
            ['dad', 'mom', ['focus']],
        ]);
        expect(familyHeadOf(deepChain, 'focus' as PersonId)).toBe('gf');
    });

    it('prefers a real person to an unknown-parent stand-in', () => {
        const withPlaceholder = tree([
            ['unknown', 'gm', ['dad']],
            ['dad', 'mom', ['focus']],
        ], ['unknown']);
        expect(familyHeadOf(withPlaceholder, 'focus' as PersonId)).toBe('gm');
    });

    it('ends on malformed data with a parent loop', () => {
        const loop = tree([['a', 'b', ['c']]]);
        loop.persons['a' as PersonId].parentIds = ['c' as PersonId];
        loop.persons['c' as PersonId].childIds = ['a' as PersonId];
        expect(['a', 'b', 'c']).toContain(familyHeadOf(loop, 'c' as PersonId));
    });
});
