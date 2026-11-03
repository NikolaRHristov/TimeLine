/**
 * One schema, described once.
 *
 * The archive is declared in `Entities.ts` and nowhere else. Everything that
 * has to agree with it - the TypeScript model, the site's Zod collections, the
 * SpacetimeDB tables - is rendered from that declaration by `Render.ts` and
 * written by `Maintain/Script/GenerateSchema.ts`.
 *
 * A declaration is a *field map*, not a type: a type is erased at runtime, so a
 * type could never be read back and compared. A field map survives, which is
 * what makes drift detectable instead of merely possible.
 *
 * ## Why a projection rather than three lists
 *
 * The three targets genuinely disagree about representation. A post keeps its
 * metrics as one object in the model, as four columns in the database and as a
 * partial object on the site; its media is an array in one place and a table of
 * its own in another. Writing three field lists would move the drift into this
 * file. Instead each entity declares its model fields once and then, per
 * target, the few transformations that differ: `drop`, `rename`, `flatten`,
 * `collapse`, `retype` and `extra`. `fieldsFor` applies them in a fixed order,
 * so a target's field set is computed and can be checked, never transcribed.
 */

/**
 * The scalar kinds a field can have.
 *
 * `bigint` is a kind of its own rather than an integer with a `column` hint: a
 * `u64` column takes a `bigint` at runtime, so a model that called the same
 * field a `number` would type-check and then fail on the insert - and would
 * silently round any value above 2^53, which is exactly the range a fence is
 * asked to stay out of.
 */
export type Scalar =
	"string" | "integer" | "number" | "bigint" | "boolean" | "timestamp" | "json" | "enum";

/** A SpacetimeDB column type, when the default for the kind is wrong. */
export type Column = "string" | "bool" | "u8" | "u32" | "u64" | "f32" | "f64";

/**
 * One field.
 *
 * `of` names an entity for `object`/`array` and a scalar for an array of
 * scalars (`of: "string"` is `string[]`). `doc` is carried into every rendered
 * artifact, so the prose is written once and travels with the declaration
 * instead of being re-typed beside each consumer.
 */
export type Field = {
	kind: Scalar | "object" | "array";
	of?: string;
	values?: readonly string[];
	optional?: boolean;
	nullable?: boolean;
	/** A rendered Zod default, e.g. `{}`. */
	fallback?: string;
	/** A stricter Zod check the model's plain type does not express. */
	format?: "url";
	/** Module only: the column type, when the kind's default is wrong. */
	column?: Column;
	doc?: string;
};

export type FieldMap = Record<string, Field>;

/**
 * How one target differs from the model.
 *
 * Every operation names model fields and leaves the rest untouched, so adding
 * a field to the model reaches every target without an edit here - which is the
 * whole point of deriving instead of transcribing.
 */
export type Projection = {
	/** Model fields this target does not declare. */
	drop?: readonly string[];
	/** Model fields this target spells differently. */
	rename?: Record<string, string>;
	/** A model object field this target spreads into columns of its own. */
	flatten?: Record<string, FieldMap>;
	/** A model field this target keeps as one opaque column. */
	collapse?: Record<string, Field>;
	/** A model field whose type differs in this target. */
	retype?: Record<string, Field>;
	/** Fields this target declares that the model does not. */
	extra?: FieldMap;
};

/** The SpacetimeDB table an entity is stored in. */
export type ModuleTable = Projection & {
	table: string;
	/** The primary key field, as spelled in this target. */
	key: string;
	/** Indexed fields, as spelled in this target. */
	index?: readonly string[];
	public: boolean;
	doc?: string;
};

/** The site's view of an entity. */
export type SiteSchema = Projection & {
	/** The Zod const's name. */
	name: string;
	/**
	 * The content collection this entity is, if any. Absent for a shape that is
	 * only ever nested inside another - a media item, a decision.
	 */
	collection?: string;
	doc?: string;
};

export type Entity = {
	/** The descriptor key; what `of` names. */
	name: string;
	doc?: string;
	/** The TypeScript model type this entity is. */
	model: { type: string; doc?: string; fields: FieldMap };
	module?: ModuleTable;
	site?: SiteSchema;
};

/** The three consumers of one declaration. */
export type Target = "model" | "module" | "site";

function projectionOf(entity: Entity, target: Target): Projection | undefined {
	return target === "module" ? entity.module : target === "site" ? entity.site : undefined;
}

/**
 * The field map one target declares for one entity.
 *
 * Order is the model's order with the target's extras appended, so the rendered
 * artifacts are byte-stable and a diff shows exactly what changed. A target
 * that does not carry the entity has no fields at all - which is the honest
 * answer for an entity that is only ever nested.
 */
export function fieldsFor(entity: Entity, target: Target): FieldMap {
	if (target === "model") return entity.model.fields;

	const projection = projectionOf(entity, target);
	if (projection === undefined) return {};

	const fields: FieldMap = {};
	for (const [name, field] of Object.entries(entity.model.fields)) {
		if (projection.drop?.includes(name) === true) continue;

		const collapsed = projection.collapse?.[name];
		if (collapsed !== undefined) {
			fields[projection.rename?.[name] ?? name] = collapsed;
			continue;
		}

		const flattened = projection.flatten?.[name];
		if (flattened !== undefined) {
			for (const [column, columnField] of Object.entries(flattened))
				fields[column] = columnField;
			continue;
		}

		fields[projection.rename?.[name] ?? name] = projection.retype?.[name] ?? field;
	}

	for (const [name, field] of Object.entries(projection.extra ?? {})) fields[name] = field;

	return fields;
}

/** The field-name set one target declares, in declaration order. */
export function namesFor(entity: Entity, target: Target): string[] {
	return Object.keys(fieldsFor(entity, target));
}

/** The field a target keys its rows by. */
export function keyOf(entity: Entity): string | null {
	return entity.module?.key ?? null;
}
