import React from 'react';
import {
  Alert,
  Button,
  Container,
  CustomScrollbar,
  FeatureInfoBox,
  stylesFactory,
  useTheme,
  ValuePicker,
  VerticalGroup,
} from '@grafana/ui';
import {
  DataFrame,
  DataTransformerConfig,
  DocsId,
  GrafanaTheme,
  PanelData,
  SelectableValue,
  standardTransformersRegistry,
  transformDataFrame,
} from '@grafana/data';
import { TransformationOperationRow } from './TransformationOperationRow';
import { Card, CardProps } from '../../../../core/components/Card/Card';
import { css } from 'emotion';
import { selectors } from '@grafana/e2e-selectors';
import { Unsubscribable } from 'rxjs';
import { PanelModel } from '../../state';
import { getDocsLink } from 'app/core/utils/docsLinks';
import { DragDropContext, Droppable, DropResult } from 'react-beautiful-dnd';
import { PanelNotSupported } from '../PanelEditor/PanelNotSupported';
import { AppNotificationSeverity } from '../../../../types';

interface TransformationsEditorProps {
  panel: PanelModel;
}

interface TransformationsEditorTransformation {
  transformation: DataTransformerConfig;
  id: string;
}

interface State {
  data: DataFrame[];
  transformations: TransformationsEditorTransformation[];
}

export class TransformationsEditor extends React.PureComponent<TransformationsEditorProps, State> {
  subscription?: Unsubscribable;

  constructor(props: TransformationsEditorProps) {
    super(props);
    const transformations = props.panel.transformations || [];

    const ids = this.buildTransformationIds(transformations);
    this.state = {
      transformations: transformations.map((t, i) => ({
        transformation: t,
        id: ids[i],
      })),
      data: [],
    };
  }

  buildTransformationIds(transformations: DataTransformerConfig[]) {
    const transformationCounters: Record<string, number> = {};
    const transformationIds: string[] = [];

    for (let i = 0; i < transformations.length; i++) {
      const transformation = transformations[i];
      if (transformationCounters[transformation.id] === undefined) {
        transformationCounters[transformation.id] = 0;
      } else {
        transformationCounters[transformation.id] += 1;
      }
      transformationIds.push(`${transformations[i].id}-${transformationCounters[transformations[i].id]}`);
    }
    return transformationIds;
  }

  componentDidMount() {
    this.subscription = this.props.panel
      .getQueryRunner()
      .getData({ withTransforms: false, withFieldConfig: false })
      .subscribe({
        next: (panelData: PanelData) => this.setState({ data: panelData.series }),
      });
  }

  componentWillUnmount() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  onChange(transformations: TransformationsEditorTransformation[]) {
    this.setState({ transformations });
    this.props.panel.setTransformations(transformations.map(t => t.transformation));
  }

  // Transformation uid are stored in a name-X form. name is NOT unique hence we need to parse the ids and increase X
  // for transformations with the same name
  getTransformationNextId = (name: string) => {
    const { transformations } = this.state;
    let nextId = 0;
    const existingIds = transformations.filter(t => t.id.startsWith(name)).map(t => t.id);

    if (existingIds.length !== 0) {
      nextId = Math.max(...existingIds.map(i => parseInt(i.match(/\d+/)![0], 10))) + 1;
    }

    return `${name}-${nextId}`;
  };

  onTransformationAdd = (selectable: SelectableValue<string>) => {
    const { transformations } = this.state;

    const nextId = this.getTransformationNextId(selectable.value!);
    this.onChange([
      ...transformations,
      {
        id: nextId,
        transformation: {
          id: selectable.value as string,
          options: {},
        },
      },
    ]);
  };

  onTransformationChange = (idx: number, config: DataTransformerConfig) => {
    const { transformations } = this.state;
    const next = Array.from(transformations);
    next[idx].transformation = config;
    this.onChange(next);
  };

  onTransformationRemove = (idx: number) => {
    const { transformations } = this.state;
    const next = Array.from(transformations);
    next.splice(idx, 1);
    this.onChange(next);
  };

  renderTransformationSelector = () => {
    const availableTransformers = standardTransformersRegistry.list().map(t => {
      return {
        value: t.transformation.id,
        label: t.name,
        description: t.description,
      };
    });

    return (
      <div
        className={css`
          max-width: 66%;
        `}
      >
        <ValuePicker
          size="md"
          variant="secondary"
          label="添加转换"
          options={availableTransformers}
          onChange={this.onTransformationAdd}
          isFullWidth={false}
          menuPlacement="bottom"
        />
      </div>
    );
  };

  onDragEnd = (result: DropResult) => {
    const { transformations } = this.state;

    if (!result || !result.destination) {
      return;
    }

    const startIndex = result.source.index;
    const endIndex = result.destination.index;
    if (startIndex === endIndex) {
      return;
    }
    const update = Array.from(transformations);
    const [removed] = update.splice(startIndex, 1);
    update.splice(endIndex, 0, removed);
    this.onChange(update);
  };

  renderTransformationEditors = () => {
    const { data, transformations } = this.state;

    return (
      <DragDropContext onDragEnd={this.onDragEnd}>
        <Droppable droppableId="transformations-list" direction="vertical">
          {provided => {
            return (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {transformations.map((t, i) => {
                  // Transformations are not identified uniquely by any property apart from array index.
                  // For drag and drop to work we need to generate unique ids. This record stores counters for each transformation type
                  // based on which ids are generated
                  let editor;

                  const transformationUI = standardTransformersRegistry.getIfExists(t.transformation.id);
                  if (!transformationUI) {
                    return null;
                  }

                  const input = transformDataFrame(
                    transformations.slice(0, i).map(t => t.transformation),
                    data
                  );
                  const output = transformDataFrame(
                    transformations.slice(i).map(t => t.transformation),
                    input
                  );

                  if (transformationUI) {
                    editor = React.createElement(transformationUI.editor, {
                      options: { ...transformationUI.transformation.defaultOptions, ...t.transformation.options },
                      input,
                      onChange: (options: any) => {
                        this.onTransformationChange(i, {
                          id: t.transformation.id,
                          options,
                        });
                      },
                    });
                  }

                  return (
                    <TransformationOperationRow
                      index={i}
                      id={`${t.id}`}
                      key={`${t.id}`}
                      input={input || []}
                      output={output || []}
                      onRemove={() => this.onTransformationRemove(i)}
                      editor={editor}
                      name={transformationUI.name}
                      description={transformationUI.description}
                    />
                  );
                })}
                {provided.placeholder}
              </div>
            );
          }}
        </Droppable>
      </DragDropContext>
    );
  };

  renderNoAddedTransformsState() {
    return (
      <VerticalGroup spacing={'lg'}>
        <Container grow={1}>
          <FeatureInfoBox title="转换" url={getDocsLink(DocsId.Transformations)}>
            <p>
              转换使您可以在可视化之前加入，计算，重新排序，隐藏和重命名查询结果。 <br />
              如果您使用的是Graph可视化，则许多转换都不适合，因为它目前仅支持时间序列。 <br />
              它可以帮助切换到表可视化，以了解转换在做什么。 <br />
            </p>
          </FeatureInfoBox>
        </Container>
        <VerticalGroup>
          {standardTransformersRegistry.list().map(t => {
            return (
              <TransformationCard
                key={t.name}
                title={t.name}
                description={t.description}
                actions={<Button>选择</Button>}
                ariaLabel={selectors.components.TransformTab.newTransform(t.name)}
                onClick={() => {
                  this.onTransformationAdd({ value: t.id });
                }}
              />
            );
          })}
        </VerticalGroup>
      </VerticalGroup>
    );
  }

  render() {
    const {
      panel: { alert },
    } = this.props;
    const { transformations } = this.state;

    const hasTransforms = transformations.length > 0;

    if (!hasTransforms && alert) {
      return <PanelNotSupported message="不能在具有现有警报的面板上使用转换" />;
    }

    return (
      <CustomScrollbar autoHeightMin="100%">
        <Container padding="md">
          <div aria-label={selectors.components.TransformTab.content}>
            {hasTransforms && alert ? (
              <Alert severity={AppNotificationSeverity.Error} title="不能在带有警报的面板上使用转换" />
            ) : null}
            {!hasTransforms && this.renderNoAddedTransformsState()}
            {hasTransforms && this.renderTransformationEditors()}
            {hasTransforms && this.renderTransformationSelector()}
          </div>
        </Container>
      </CustomScrollbar>
    );
  }
}

const TransformationCard: React.FC<CardProps> = props => {
  const theme = useTheme();
  const styles = getTransformationCardStyles(theme);
  return <Card {...props} className={styles.card} />;
};

const getTransformationCardStyles = stylesFactory((theme: GrafanaTheme) => {
  return {
    card: css`
      background: ${theme.colors.bg2};
      width: 100%;
      border: none;
      padding: ${theme.spacing.sm};

      // hack because these cards use classes from a very different card for some reason
      .add-data-source-item-text {
        font-size: ${theme.typography.size.md};
      }

      &:hover {
        background: ${theme.colors.bg3};
        box-shadow: none;
        border: none;
      }
    `,
  };
});
