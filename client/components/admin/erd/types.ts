export type FieldConstraint = 'PK' | 'FK' | 'NN' | 'UNQ' | 'IDX' | 'DEFAULT';
export type EntityCategory = 'core' | 'payments' | 'communication' | 'support' | 'content' | 'auth';
export type RelationType = '1:1' | '1:N' | 'N:M';

export interface ERDField {
  name: string;
  type: string;
  constraints: FieldConstraint[];
  refTable?: string;
}

export interface ERDEntity {
  id: string;
  label: string;
  tableName: string;
  category: EntityCategory;
  fields: ERDField[];
}

export interface ERDRelationship {
  id: string;
  source: string;
  target: string;
  sourceField: string;
  targetField: string;
  relationType: RelationType;
  label?: string;
}
