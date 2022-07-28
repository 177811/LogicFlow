import { BaseNode, RectNodeModel } from '@helinda-test-logicflow/core';

class MarkRootModel extends RectNodeModel {
  static extendKey = 'MarkRootModel';
}

class MarkRootView extends BaseNode {
  getShape() {
    return '';
  }
}

const MarkRoot = {
  type: 'faker:root',
  view: MarkRootView,
  model: MarkRootModel,
};

export default MarkRoot;
