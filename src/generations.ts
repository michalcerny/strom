/**
 * Generation assignment shared across features (family book, statistics).
 *
 * Generation = longest ancestor path (a person is one generation below their
 * deepest parent). Memoized DAG walk with a cycle guard, so malformed data with
 * a parent loop resolves to 0 rather than recursing forever. Roots (no parents)
 * are generation 0 — unless they married into the family (see below); the
 * number grows downward toward descendants.
 */

import { StromData, PersonId } from './types.js';

/**
 * Map every person id to its generation number (0 = oldest ancestor).
 *
 * A person without recorded parents who married into the family (an in-law)
 * takes their partner's generation instead of 0 — otherwise every in-law
 * lands among the oldest ancestors (statistics per generation, book order).
 */
export function assignGenerations(data: StromData): Map<string, number> {
    const { persons } = data;

    // Partners of every person, from the partnerships.
    const partnersOf = new Map<string, string[]>();
    for (const u of Object.values(data.partnerships ?? {})) {
        if (!persons[u.person1Id] || !persons[u.person2Id]) continue;
        (partnersOf.get(u.person1Id) ?? partnersOf.set(u.person1Id, []).get(u.person1Id)!).push(u.person2Id);
        (partnersOf.get(u.person2Id) ?? partnersOf.set(u.person2Id, []).get(u.person2Id)!).push(u.person1Id);
    }

    // Generation of parentless persons (roots); 0 unless raised below.
    const rootGen = new Map<string, number>();

    const compute = (): Map<string, number> => {
        const gen = new Map<string, number>();
        const genOf = (id: string, seen = new Set<string>()): number => {
            if (gen.has(id)) return gen.get(id)!;
            if (seen.has(id)) return 0; // cycle guard
            seen.add(id);
            const p = persons[id as PersonId];
            let g = rootGen.get(id) ?? 0;
            if (p && p.parentIds.length > 0) {
                g = Math.max(...p.parentIds.map(pid => genOf(pid, seen))) + 1;
            }
            gen.set(id, g);
            return g;
        };
        for (const id of Object.keys(persons)) genOf(id);
        return gen;
    };

    let gen = compute();
    // Raise parentless partners to their partner's generation. A few rounds
    // settle chains (an in-law whose own child's partner is an in-law);
    // capped so malformed data (a loop through partners) cannot spin forever.
    for (let round = 0; round < 8; round++) {
        let changed = false;
        for (const [id, partners] of partnersOf) {
            const p = persons[id as PersonId];
            if (!p || p.parentIds.length > 0) continue;
            const target = Math.max(...partners.map(pid => gen.get(pid) ?? 0));
            if (target > (rootGen.get(id) ?? 0)) {
                rootGen.set(id, target);
                changed = true;
            }
        }
        if (!changed) break;
        gen = compute();
    }
    return gen;
}

/**
 * The head of the family a person belongs to, for the "whole family" view:
 * of the person's topmost ancestors (no recorded parents; the person themself
 * when they have none), the one with the most blood descendants — the vantage
 * from which one descendants chart shows the most of the family. Ties go to
 * a real person over an unknown-parent stand-in, then to the one more
 * generations up, then to the first reached (the order of parentIds).
 */
export function familyHeadOf(data: StromData, personId: PersonId): PersonId {
    const { persons } = data;
    const parentsOf = (id: PersonId): PersonId[] =>
        (persons[id]?.parentIds ?? []).filter(pid => persons[pid]);

    // Topmost ancestors with their depth (nearest one on pedigree collapse).
    const heads: { id: PersonId; depth: number }[] = [];
    const seen = new Set<PersonId>([personId]);
    let frontier: PersonId[] = [personId];
    for (let depth = 0; frontier.length > 0; depth++) {
        const next: PersonId[] = [];
        for (const id of frontier) {
            const parents = parentsOf(id);
            if (parents.length === 0) heads.push({ id, depth });
            for (const pid of parents) {
                if (seen.has(pid)) continue;
                seen.add(pid);
                next.push(pid);
            }
        }
        frontier = next;
    }

    const bloodCount = (id: PersonId): number => {
        const blood = new Set<PersonId>([id]);
        const queue: PersonId[] = [id];
        while (queue.length > 0) {
            for (const childId of persons[queue.shift()!]?.childIds ?? []) {
                if (persons[childId] && !blood.has(childId)) {
                    blood.add(childId);
                    queue.push(childId);
                }
            }
        }
        return blood.size;
    };

    let best: { id: PersonId; depth: number; count: number; real: boolean } | null = null;
    for (const head of heads) {
        const candidate = { ...head, count: bloodCount(head.id), real: !persons[head.id]?.isPlaceholder };
        if (!best
            || candidate.count > best.count
            || (candidate.count === best.count && candidate.real && !best.real)
            || (candidate.count === best.count && candidate.real === best.real && candidate.depth > best.depth)) {
            best = candidate;
        }
    }
    return best?.id ?? personId;
}
