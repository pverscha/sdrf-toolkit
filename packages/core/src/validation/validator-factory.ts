import type { OntologyRegistry } from "@sdrf-toolkit/ontology-lookup";
import { CellValidatorType, GlobalValidatorType } from "../types/template.js";
import type { CellValidatorDefinition, GlobalValidatorDefinition } from "../types/template.js";
import type { CellValidator, GlobalValidator } from "./validators/base.js";
import { OntologyValidator, type OntologyParams } from "./validators/ontology.js";
import { PatternValidator, type PatternParams } from "./validators/pattern.js";
import { ValuesValidator, type ValuesParams } from "./validators/values.js";
import { TrailingWhitespaceValidator } from "./validators/trailing-whitespace.js";
import { ColumnOrderValidator } from "./validators/column-order.js";
import { EmptyCellsValidator } from "./validators/empty-cells.js";
import { CombinationNoDuplicateValidator, type CombinationNoDuplicateParams } from "./validators/combination-no-duplicate.js";
import { SingleCardinalityValidator, type SingleCardinalityParams } from "./validators/single-cardinality.js";
import { NumberWithUnitValidator, type NumberWithUnitParams } from "./validators/number-with-unit.js";
import { MzValueValidator, type MzValueParams } from "./validators/mz-value.js";
import { MzRangeIntervalValidator, type MzRangeIntervalParams } from "./validators/mz-range-interval.js";
import { DateValidator, type DateParams } from "./validators/date.js";
import { AccessionValidator, type AccessionParams } from "./validators/accession.js";
import { IdentifierValidator, type IdentifierParams } from "./validators/identifier.js";
import { SemverValidator, type SemverParams } from "./validators/semver.js";
import { StructuredKvValidator, type StructuredKvParams } from "./validators/structured-kv.js";
import { MinColumnsValidator, type MinColumnsParams } from "./validators/min-columns.js";

function cast<T>(params: Record<string, unknown>): T {
  return params as unknown as T;
}

export class ValidatorFactory {
  constructor(private readonly ontologyRegistry: OntologyRegistry) {}

  createCellValidator(definition: CellValidatorDefinition): CellValidator {
    const p = definition.params;
    switch (definition.validatorName) {
      case CellValidatorType.Ontology:
        return new OntologyValidator(this.ontologyRegistry, cast<OntologyParams>(p));
      case CellValidatorType.Pattern:
        return new PatternValidator(cast<PatternParams>(p));
      case CellValidatorType.Values:
        return new ValuesValidator(cast<ValuesParams>(p));
      case CellValidatorType.SingleCardinality:
        return new SingleCardinalityValidator(cast<SingleCardinalityParams>(p));
      case CellValidatorType.NumberWithUnit:
        return new NumberWithUnitValidator(cast<NumberWithUnitParams>(p));
      case CellValidatorType.MzValue:
        return new MzValueValidator(cast<MzValueParams>(p));
      case CellValidatorType.MzRangeInterval:
        return new MzRangeIntervalValidator(cast<MzRangeIntervalParams>(p));
      case CellValidatorType.Date:
        return new DateValidator(cast<DateParams>(p));
      case CellValidatorType.Accession:
        return new AccessionValidator(cast<AccessionParams>(p));
      case CellValidatorType.Identifier:
        return new IdentifierValidator(cast<IdentifierParams>(p));
      case CellValidatorType.Semver:
        return new SemverValidator(cast<SemverParams>(p));
      case CellValidatorType.StructuredKv:
        return new StructuredKvValidator(cast<StructuredKvParams>(p));
      default:
        throw new Error(`Unknown cell validator: "${definition.validatorName}"`);
    }
  }

  createGlobalValidator(definition: GlobalValidatorDefinition): GlobalValidator {
    const p = definition.params;
    switch (definition.validatorName) {
      case GlobalValidatorType.TrailingWhitespace:
        return new TrailingWhitespaceValidator();
      case GlobalValidatorType.ColumnOrder:
        return new ColumnOrderValidator();
      case GlobalValidatorType.EmptyCells:
        return new EmptyCellsValidator();
      case GlobalValidatorType.CombinationNoDuplicate:
        return new CombinationNoDuplicateValidator(cast<CombinationNoDuplicateParams>(p));
      case GlobalValidatorType.MinColumns:
        return new MinColumnsValidator(cast<MinColumnsParams>(p));
      default:
        throw new Error(`Unknown global validator: "${definition.validatorName}"`);
    }
  }
}
