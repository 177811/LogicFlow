import { BaseNodeModel } from '@helinda-test-logicflow/core';

type PointTuple = [number, number];

export type ExclusiveGatewayAttribute = BaseNodeModel & {
  points?: PointTuple[] & string;
};
