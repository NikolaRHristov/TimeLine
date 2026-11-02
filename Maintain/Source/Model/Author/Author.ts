/**
 * The account behind a post, as the page shows it.
 *
 * Declared in `Model/Schema/Entities.ts` as the `author` entity and rendered
 * into `Model/Generated/Types.ts`; this module is the name the rest of the
 * pipeline imports, so no call site has to know where the shape came from.
 */
export type { Author } from "../Generated/Types.ts";
