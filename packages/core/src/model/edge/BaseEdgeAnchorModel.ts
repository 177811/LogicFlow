import {
  action, observable, computed, toJS,
} from 'mobx';
import { assign, cloneDeep } from 'lodash-es';
import { createUuid } from '../../util/uuid';
import { getAnchors } from '../../util/node';
import { IBaseModel } from '../BaseModel';
import GraphModel from '../GraphModel';
import {
  Point,
  AdditionData,
  EdgeData,
  MenuConfig,
  EdgeConfig,
  ShapeStyleAttribute, AnchorsOffsetItem, PointAnchor, PointTuple, AnchorConfig,
} from '../../type/index';
import {
  ModelType, ElementType, OverlapMode,
} from '../../constant/constant';
import { OutlineTheme } from '../../constant/DefaultTheme';
import { defaultAnimationData } from '../../constant/DefaultAnimation';
import { formatData } from '../../util/compatible';
import { pickEdgeConfig, twoPointDistance } from '../../util/edge';
import { getZIndex } from '../../util/zIndex';
import { ConnectRule, ConnectRuleResult } from '../node';
import BaseNodeModel from '../node/BaseNodeModel';

class BaseEdgeAnchorModel implements IBaseModel {
  // 数据属性
  id = createUuid();
  @observable type = '';
  @observable sourceNodeId = '';
  @observable targetNodeId = '';
  @observable startPoint = null;
  @observable endPoint = null;
  @observable anchorsOffset: AnchorsOffsetItem[] = []; // 根据与(x, y)的偏移量计算anchors的坐标
  @observable text = {
    value: '',
    x: 0,
    y: 0,
    draggable: false,
    editable: true,
  };
  @observable properties: Record<string, any> = {};
  @observable points = '';
  @observable pointsList = [];
  // 状态属性
  @observable isSelected = false;
  @observable isHovered = false;
  @observable isHitable = true; // 细粒度控制边是否对用户操作进行反应
  @observable draggable = true;
  @observable visible = true;
  @observable isAnimation = false;
  // 引用属性
  graphModel: GraphModel;
  @observable zIndex = 0;
  readonly BaseType = ElementType.EDGE;
  modelType = ModelType.EDGE;
  @observable state = 1;
  additionStateData: AdditionData;
  sourceAnchorId = '';
  targetAnchorId = '';
  menu?: MenuConfig[];
  customTextPosition = false; // 是否自定义边文本位置
  animationData = defaultAnimationData;
  @observable style: ShapeStyleAttribute = { }; // 每条边自己的样式，动态修改
  @observable arrowConfig = {
    markerEnd: `url(#marker-end-${this.id})`,
    markerStart: '',
  }; // 箭头属性
  targetRules: ConnectRule[] = [];
  sourceRules: ConnectRule[] = [];
  [propName: string]: any; // 支持自定义

  constructor(data: EdgeConfig, graphModel: GraphModel) {
    this.graphModel = graphModel;
    this.initEdgeData(data);
    this.setAttributes();
    // 设置边的 anchors，也就是边的两个端点
    // 端点依赖于 edgeData 的 sourceNode 和 targetNode
    this.setAnchors();
    // 边的拐点依赖于两个端点
    this.initPoints();
    // 文本位置依赖于边上的所有拐点
    this.formatText(data);
    this.properties = {
      staticAttribute: {
        anchor: [
          {
            id: null,
            passagewayType: 'input',
            percentage: 0.4,
            ancId: null,
            ancSimId: null,
            ancFlow: null,
            ancCapacity: null,
          },
          {
            id: null,
            passagewayType: 'output',
            percentage: 0.6,
            ancId: null,
            ancSimId: null,
            ancFlow: null,
            ancCapacity: null,
          },
        ],
      },
    };
  }
  /**
   * @overridable 支持重写
   * 初始化边数据
   * initNodeData和setAttributes的区别在于
   * initNodeData只在节点初始化的时候调用，用于初始化节点的所有属性。
   * setAttributes除了初始化调用外，还会在properties发生变化了调用。
   */
  initEdgeData(data) {
    if (!data.properties) {
      data.properties = {};
    }

    if (!data.id) {
      // 自定义边id > 全局定义边id > 内置
      const { idGenerator } = this.graphModel;
      const globalId = idGenerator && idGenerator(data.type);
      if (globalId) data.id = globalId;
      const nodeId = this.createId();
      if (nodeId) data.id = nodeId;
    }

    assign(this, pickEdgeConfig(data));
    const { overlapMode } = this.graphModel;
    if (overlapMode === OverlapMode.INCREASE) {
      this.zIndex = data.zIndex || getZIndex();
    }
  }
  /**
   * 设置model属性，每次properties发生变化会触发
   * @overridable 支持重写
   */
  setAttributes() { }
  /**
   * @overridable 支持重写，自定义此类型节点默认生成方式
   * @returns string
   */
  createId() {
    return null;
  }
  /**
   * @overridable 支持重写
   * 获取当前节点样式
   * @returns 自定义边样式
   */
  getEdgeStyle() {
    return {
      ...this.graphModel.theme.baseEdge,
      ...this.style,
    };
  }
  /**
   * @overridable 支持重写
   * 获取当前节点文本样式
   */
  getTextStyle() {
    // 透传 edgeText
    const { edgeText } = this.graphModel.theme;
    return cloneDeep(edgeText);
  }
  /**
   * @overridable 支持重写
   * 获取当前边的动画样式
   * @returns 自定义边动画样式
   */
  getAnimation() {
    const { animationData } = this;
    return cloneDeep(animationData);
  }
  /**
   * @overridable 支持重写
   * 获取当前边的动画样式
   * @returns 自定义边动画样式
   */
  getEdgeAnimationStyle() {
    const { edgeAnimation } = this.graphModel.theme;
    return cloneDeep(edgeAnimation);
  }
  /**
   * @overridable 支持重写
   * 获取outline样式，重写可以定义此类型边outline样式， 默认使用主题样式
   * @returns 自定义outline样式
   */
  getOutlineStyle(): OutlineTheme {
    const { graphModel } = this;
    const { outline } = graphModel.theme;
    return cloneDeep(outline);
  }
  /**
   * @overridable 支持重新，重新自定义文本位置
   * @returns 文本位置
   */
  getTextPosition(): Point {
    return {
      x: 0,
      y: 0,
    };
  }
  @computed get sourceNode() {
    return this.graphModel?.nodesMap[this.sourceNodeId]?.model;
  }
  @computed get targetNode() {
    return this.graphModel?.nodesMap[this.targetNodeId]?.model
      || this.graphModel?.edgesMap[this.targetNodeId]?.model;
  }
  @computed get textPosition(): Point {
    return this.getTextPosition();
  }

  /**
   * 内部方法，计算两个节点相连是起点位置
   */
  getBeginAnchor(sourceNode, targetNode): Point {
    let position;
    let minDistance;
    const sourceAnchors = getAnchors(sourceNode);
    sourceAnchors.forEach((anchor) => {
      const distance = twoPointDistance(anchor, targetNode);
      if (!minDistance) {
        minDistance = distance;
        position = anchor;
      } else if (distance < minDistance) {
        minDistance = distance;
        position = anchor;
      }
    });
    return position;
  }

  /**
   * 内部方法，计算两个节点相连是终点位置
   */
  getEndAnchor(targetNode): Point {
    let position;
    let minDistance;
    const targetAnchors = getAnchors(targetNode);
    targetAnchors.forEach((anchor) => {
      const distance = twoPointDistance(anchor, this.startPoint);
      if (!minDistance) {
        minDistance = distance;
        position = anchor;
      } else if (distance < minDistance) {
        minDistance = distance;
        position = anchor;
      }
    });
    return position;
  }
  /**
   * 获取当前边的properties
   */
  getProperties() {
    return toJS(this.properties);
  }
  /**
   * 获取被保存时返回的数据
   */
  getData(): EdgeData {
    const { x, y, value } = this.text;
    const data: EdgeData = {
      id: this.id,
      type: this.type,
      sourceNodeId: this.sourceNode.id,
      targetNodeId: this.targetNode.id,
      startPoint: Object.assign({}, this.startPoint),
      endPoint: Object.assign({}, this.endPoint),
      properties: toJS(this.properties),
    };
    if (value) {
      data.text = {
        x,
        y,
        value,
      };
    }
    if (this.graphModel.overlapMode === OverlapMode.INCREASE) {
      data.zIndex = this.zIndex;
    }
    return data;
  }
  /**
   * 用于在历史记录时获取节点数据，
   * 在某些情况下，如果希望某个属性变化不引起history的变化，
   * 可以重写此方法。
   */
  getHistoryData(): EdgeData {
    return this.getData();
  }
  @action
  setProperty(key, val): void {
    this.properties[key] = formatData(val);
    this.setAttributes();
  }

  @action
  setProperties(properties): void {
    this.properties = {
      ...this.properties,
      ...formatData(properties),
    };
    this.setAttributes();
  }

  // 设置样式
  @action
  setStyle(key, val): void {
    this.style = {
      ...this.style,
      [key]: formatData(val),
    };
  }

  @action
  setStyles(styles): void {
    this.style = {
      ...this.style,
      ...formatData(styles),
    };
  }

  @action
  updateStyles(styles): void {
    this.style = {
      ...formatData(styles),
    };
  }

  /**
   * 内部方法，处理初始化文本格式
   */
  @action formatText(data) {
    // 暂时处理，只传入text的情况
    const { x, y } = this.textPosition;
    if (!data.text || typeof data.text === 'string') {
      this.text = {
        value: data.text || '',
        x,
        y,
        draggable: this.text.draggable,
        editable: this.text.editable,
      };
      return;
    }

    if (Object.prototype.toString.call(data.text) === '[object Object]') {
      this.text = {
        x: data.text.x || x,
        y: data.text.y || y,
        value: data.text.value || '',
        draggable: this.text.draggable,
        editable: this.text.editable,
      };
    }
  }
  /**
   * 重置文本位置
   */
  @action resetTextPosition() {
    const { x, y } = this.textPosition;
    this.text.x = x;
    this.text.y = y;
  }
  /**
   * 移动边上的文本
   */
  @action moveText(deltaX: number, deltaY: number): void {
    if (this.text) {
      const {
        x,
        y,
        value,
        draggable,
        editable,
      } = this.text;
      this.text = {
        value,
        draggable,
        x: x + deltaX,
        y: y + deltaY,
        editable,
      };
    }
  }
  /**
   * 设置文本位置和值
   */
  @action setText(textConfig): void {
    if (textConfig) {
      assign(this.text, textConfig);
    }
  }
  /**
   * 更新文本的值
   */
  @action updateText(value: string): void {
    this.text = {
      ...this.text,
      value,
    };
  }
  /**
   * 内部方法，计算边的起点和终点和其对于的锚点Id
   */
  @action
  setAnchors(): void {
    if (!this.sourceAnchorId || !this.startPoint) {
      const anchor = this.getBeginAnchor(this.sourceNode, this.targetNode);
      if (!this.startPoint) {
        this.startPoint = {
          x: anchor.x,
          y: anchor.y,
        };
      }
      if (!this.sourceAnchorId) {
        this.sourceAnchorId = anchor.id;
      }
    }
    if (!this.targetAnchorId || !this.endPoint) {
      const anchor = this.getEndAnchor(this.targetNode);
      if (!this.endPoint) {
        this.endPoint = {
          x: anchor.x,
          y: anchor.y,
        };
      }
      if (!this.targetAnchorId) {
        this.targetAnchorId = anchor.id;
      }
    }
  }

  @action
  setSelected(flag = true): void {
    this.isSelected = flag;
  }

  @action
  setHovered(flag = true): void {
    this.isHovered = flag;
  }

  @action
  setHitable(flag = true): void {
    this.isHitable = flag;
  }

  @action
  openEdgeAnimation(): void {
    this.isAnimation = true;
  }

  @action
  closeEdgeAnimation(): void {
    this.isAnimation = false;
  }

  @action
  setElementState(state: number, additionStateData?: AdditionData): void {
    this.state = state;
    this.additionStateData = additionStateData;
  }

  @action
  updateStartPoint(anchor): void {
    this.startPoint = anchor;
  }

  @action
  moveStartPoint(deltaX, deltaY): void {
    this.startPoint.x += deltaX;
    this.startPoint.y += deltaY;
  }

  @action
  updateEndPoint(anchor): void {
    this.endPoint = anchor;
  }

  @action
  moveEndPoint(deltaX, deltaY): void {
    this.endPoint.x += deltaX;
    this.endPoint.y += deltaY;
  }

  @action
  setZIndex(zindex = 0): void {
    this.zIndex = zindex;
  }

  @action
  initPoints() {}

  @action
  updateAttributes(attributes) {
    assign(this, attributes);
  }
  // 获取边调整的起点
  @action
  getAdjustStart() {
    return this.startPoint;
  }
  // 获取边调整的终点
  @action
  getAdjustEnd() {
    return this.endPoint;
  }
  // 起终点拖拽调整过程中，进行直线路径更新
  @action
  updateAfterAdjustStartAndEnd({ startPoint, endPoint }) {
    console.log('startPoint, endPoint');
    console.log(startPoint, endPoint);
    this.updateStartPoint({ x: startPoint.x, y: startPoint.y });
    this.updateEndPoint({ x: endPoint.x, y: endPoint.y });
  }
  getAnchorsByOffset(): PointAnchor[] {
    const {
      anchorsOffset,
      id,
      startPoint,
      endPoint,
    } = this;
    if (anchorsOffset && anchorsOffset.length > 0) {
      return anchorsOffset.map((el, idx) => {
        if (el.length) {
          el = el as PointTuple; // 历史数据格式
          return {
            id: `${id}_${idx}`,
            x: startPoint.x + el[0],
            y: startPoint.y + el[1],
          };
        }
        el = el as PointAnchor;
        return {
          ...el,
          x: startPoint.x + el.x,
          y: startPoint.y + el.y,
          id: el.id || `${id}_${idx}`,
        };
      });
    }
    return this.getDefaultAnchor();
  }
  /**
   * @overridable 子类重写此方法设置默认锚点
   * 获取节点默认情况下的锚点
   */
  public getDefaultAnchor(): PointAnchor[] {
    return [];
  }
  get anchors(): PointAnchor[] {
    return this.getAnchorsByOffset();
  }
  isAllowConnectedAsTarget(
    source: BaseEdgeAnchorModel|BaseNodeModel,
    soureAnchor: AnchorConfig,
    targetAnchor: AnchorConfig,
  ): ConnectRuleResult | Boolean {
    const rules = !this.hasSetTargetRules
      ? this.getConnectedTargetRules()
      : this.targetRules;
    this.hasSetTargetRules = true;
    let isAllPass = true;
    let msg: string;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule.validate.call(this, source, this, soureAnchor, targetAnchor)) {
        isAllPass = false;
        msg = rule.message;
        break;
      }
    }
    return {
      isAllPass,
      msg,
    };
  }
  isAllowConnectedAsSource(
    target: BaseNodeModel,
    soureAnchor: AnchorConfig,
    targetAnchor: AnchorConfig,
  ): ConnectRuleResult | Boolean {
    const rules = !this.hasSetSourceRules
      ? this.getConnectedSourceRules()
      : this.sourceRules;
    this.hasSetSourceRules = true;
    let isAllPass = true;
    let msg: string;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule.validate.call(this, this, target, soureAnchor, targetAnchor)) {
        isAllPass = false;
        msg = rule.message;
        break;
      }
    }
    return {
      isAllPass: false,
      msg: 'not allow',
    };
  }
  /**
   * 获取作为连线终点时的所有规则。
   */
  getConnectedTargetRules(): ConnectRule[] {
    return this.targetRules;
  }
  getAnchorStyle(anchorInfo): Record<string, any> {
    const { anchor } = this.graphModel.theme;
    // 防止被重写覆盖主题。
    return cloneDeep(anchor);
  }
  /**
   * @overridable 支持重写
   * 获取当前节点锚点拖出连线样式
   * @returns 自定义锚点拖出样式
   */
  getAnchorLineStyle() {
    const { anchorLine } = this.graphModel.theme;
    return cloneDeep(anchorLine);
  }
}

export { BaseEdgeAnchorModel };
export default BaseEdgeAnchorModel;
