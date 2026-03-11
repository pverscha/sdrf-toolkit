// Types
export type {
  RawSdrfTemplate,
  RawColumnDefinition,
  RawCellValidator,
  RawGlobalValidator,
  RawRequirement,
  RawExcludes,
  SdrfTemplate,
  ColumnDefinition,
  CellValidatorDefinition,
  GlobalValidatorDefinition,
} from "./types/template.js";

export type { SdrfFile, SdrfRow } from "./types/sdrf.js";

export type {
  ErrorLevel,
  ValidationIssue,
  CellValidationResult,
  FileValidationResult,
} from "./types/validation.js";

// Template registry
export { parseTemplate } from "./templates/parser.js";
export { mergeTemplates } from "./templates/merger.js";
export { TemplateRegistry } from "./templates/registry.js";
export { satisfiesConstraint } from "./templates/semver-utils.js";

// SDRF I/O
export { parseSdrf, parseSdrfFile } from "./sdrf/parser.js";
export { serializeSdrf } from "./sdrf/serializer.js";

// Validation
export { ValidationEngine } from "./validation/engine.js";
export { ValidatorFactory } from "./validation/validator-factory.js";
export { checkSpecialValue } from "./validation/helpers.js";
export type { CellValidator, GlobalValidator, CellValidationContext } from "./validation/validators/base.js";

// Validators — cell
export { PatternValidator } from "./validation/validators/pattern.js";
export { ValuesValidator } from "./validation/validators/values.js";
export { SingleCardinalityValidator } from "./validation/validators/single-cardinality.js";
export { NumberWithUnitValidator } from "./validation/validators/number-with-unit.js";
export { MzValueValidator } from "./validation/validators/mz-value.js";
export { MzRangeIntervalValidator } from "./validation/validators/mz-range-interval.js";
export { DateValidator } from "./validation/validators/date.js";
export { AccessionValidator } from "./validation/validators/accession.js";
export { IdentifierValidator } from "./validation/validators/identifier.js";
export { SemverValidator } from "./validation/validators/semver.js";
export { StructuredKvValidator } from "./validation/validators/structured-kv.js";

// Validators — global
export { MinColumnsValidator } from "./validation/validators/min-columns.js";
