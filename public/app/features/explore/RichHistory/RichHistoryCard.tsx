import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { hot } from 'react-hot-loader';
import { css, cx } from 'emotion';
import { stylesFactory, useTheme, TextArea, Button, IconButton } from '@grafana/ui';
import { getDataSourceSrv } from '@grafana/runtime';
import { GrafanaTheme, AppEvents, DataSourceApi } from '@grafana/data';
import { RichHistoryQuery, ExploreId } from 'app/types/explore';
import { copyStringToClipboard, createUrlFromRichHistory, createQueryText } from 'app/core/utils/richHistory';
import appEvents from 'app/core/app_events';
import { StoreState, CoreEvents } from 'app/types';

import { changeDatasource, updateRichHistory, setQueries } from '../state/actions';
export interface Props {
  query: RichHistoryQuery;
  dsImg: string;
  isRemoved: boolean;
  changeDatasource: typeof changeDatasource;
  updateRichHistory: typeof updateRichHistory;
  setQueries: typeof setQueries;
  exploreId: ExploreId;
  datasourceInstance: DataSourceApi;
}

const getStyles = stylesFactory((theme: GrafanaTheme, isRemoved: boolean) => {
  /* Hard-coded value so all buttons and icons on right side of card are aligned */
  const rigtColumnWidth = '240px';
  const rigtColumnContentWidth = '170px';

  /* If datasource was removed, card will have inactive color */
  const cardColor = theme.isLight
    ? isRemoved
      ? theme.palette.gray95
      : theme.palette.white
    : isRemoved
    ? theme.palette.gray15
    : theme.palette.gray05;

  return {
    queryCard: css`
      display: flex;
      flex-direction: column;
      border: 1px solid ${theme.colors.formInputBorder};
      margin: ${theme.spacing.sm} 0;
      background-color: ${cardColor};
      border-radius: ${theme.border.radius.sm};
      .starred {
        color: ${theme.palette.orange};
      }
    `,
    cardRow: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: ${theme.spacing.sm};
      border-bottom: none;
      :first-of-type {
        border-bottom: 1px solid ${theme.colors.formInputBorder};
        padding: ${theme.spacing.xs} ${theme.spacing.sm};
      }
      img {
        height: ${theme.typography.size.base};
        max-width: ${theme.typography.size.base};
        margin-right: ${theme.spacing.sm};
      }
    `,
    datasourceContainer: css`
      display: flex;
      align-items: center;
      font-size: ${theme.typography.size.sm};
      font-weight: ${theme.typography.weight.semibold};
    `,
    queryActionButtons: css`
      max-width: ${rigtColumnContentWidth};
      display: flex;
      justify-content: flex-end;
      font-size: ${theme.typography.size.base};
      button {
        margin-left: ${theme.spacing.sm};
      }
    `,
    queryContainer: css`
      font-weight: ${theme.typography.weight.semibold};
      width: calc(100% - ${rigtColumnWidth});
    `,
    queryRow: css`
      border-top: 1px solid ${theme.colors.formInputBorder};
      word-break: break-all;
      padding: 4px 2px;
      :first-child {
        border-top: none;
        padding: 0 0 4px 0;
      }
    `,
    updateCommentContainer: css`
      width: calc(100% + ${rigtColumnWidth});
      margin-top: ${theme.spacing.sm};
    `,
    comment: css`
      overflow-wrap: break-word;
      font-size: ${theme.typography.size.sm};
      font-weight: ${theme.typography.weight.regular};
      margin-top: ${theme.spacing.xs};
    `,
    commentButtonRow: css`
      > * {
        margin-right: ${theme.spacing.sm};
      }
    `,
    textArea: css`
      border: 1px solid ${theme.colors.formInputBorder};
      background: inherit;
      color: inherit;
      width: 100%;
      font-size: ${theme.typography.size.sm};
      &placeholder {
        padding: 0 ${theme.spacing.sm};
      }
    `,
    runButton: css`
      max-width: ${rigtColumnContentWidth};
      display: flex;
      justify-content: flex-end;
      button {
        height: auto;
        padding: ${theme.spacing.xs} ${theme.spacing.md};
        line-height: 1.4;
        span {
          white-space: normal !important;
        }
      }
    `,
  };
});

export function RichHistoryCard(props: Props) {
  const {
    query,
    dsImg,
    isRemoved,
    updateRichHistory,
    changeDatasource,
    exploreId,
    datasourceInstance,
    setQueries,
  } = props;
  const [activeUpdateComment, setActiveUpdateComment] = useState(false);
  const [comment, setComment] = useState<string | undefined>(query.comment);
  const [queryDsInstance, setQueryDsInstance] = useState<DataSourceApi | undefined>(undefined);

  useEffect(() => {
    const getQueryDsInstance = async () => {
      const ds = await getDataSourceSrv().get(query.datasourceName);
      setQueryDsInstance(ds);
    };

    getQueryDsInstance();
  }, [query.datasourceName]);

  const theme = useTheme();
  const styles = getStyles(theme, isRemoved);

  const onRunQuery = async () => {
    const queriesToRun = query.queries;
    if (query.datasourceName !== datasourceInstance?.name) {
      await changeDatasource(exploreId, query.datasourceName, { importQueries: true });
      setQueries(exploreId, queriesToRun);
    } else {
      setQueries(exploreId, queriesToRun);
    }
  };

  const onCopyQuery = () => {
    const queriesToCopy = query.queries.map(q => createQueryText(q, queryDsInstance)).join('\n');
    copyStringToClipboard(queriesToCopy);
    appEvents.emit(AppEvents.alertSuccess, ['查询已复制到剪贴板']);
  };

  const onCreateLink = () => {
    const url = createUrlFromRichHistory(query);
    copyStringToClipboard(url);
    appEvents.emit(AppEvents.alertSuccess, ['链接已复制到剪贴板']);
  };

  const onDeleteQuery = () => {
    // For starred queries, we want confirmation. For non-starred, we don't.
    if (query.starred) {
      appEvents.emit(CoreEvents.showConfirmModal, {
        title: '删除',
        text: '您确定要永久删除已加星标的查询吗？',
        yesText: '删除',
        icon: 'trash-alt',
        onConfirm: () => {
          updateRichHistory(query.ts, 'delete');
          appEvents.emit(AppEvents.alertSuccess, ['查询已删除']);
        },
      });
    } else {
      updateRichHistory(query.ts, 'delete');
      appEvents.emit(AppEvents.alertSuccess, ['查询已删除']);
    }
  };

  const onStarrQuery = () => {
    updateRichHistory(query.ts, 'starred');
  };

  const toggleActiveUpdateComment = () => setActiveUpdateComment(!activeUpdateComment);

  const onUpdateComment = () => {
    updateRichHistory(query.ts, 'comment', comment);
    setActiveUpdateComment(false);
  };

  const onCancelUpdateComment = () => {
    setActiveUpdateComment(false);
    setComment(query.comment);
  };

  const onKeyDown = (keyEvent: React.KeyboardEvent) => {
    if (keyEvent.key === 'Enter' && (keyEvent.shiftKey || keyEvent.ctrlKey)) {
      onUpdateComment();
    }

    if (keyEvent.key === 'Escape') {
      onCancelUpdateComment();
    }
  };

  const updateComment = (
    <div className={styles.updateCommentContainer} aria-label={comment ? '更新注解' : '添加注解'}>
      <TextArea
        value={comment}
        placeholder={comment ? undefined : '查询功能的可选说明。'}
        onChange={e => setComment(e.currentTarget.value)}
        className={styles.textArea}
      />
      <div className={styles.commentButtonRow}>
        <Button onClick={onUpdateComment} aria-label="Submit button">
          保存注解
        </Button>
        <Button variant="secondary" onClick={onCancelUpdateComment}>
          取消
        </Button>
      </div>
    </div>
  );

  const queryActionButtons = (
    <div className={styles.queryActionButtons}>
      <IconButton
        name="comment-alt"
        onClick={toggleActiveUpdateComment}
        title={query.comment?.length > 0 ? '编辑注解' : '添加注解'}
      />
      <IconButton name="copy" onClick={onCopyQuery} title="将查询复制到剪贴板" />
      {!isRemoved && <IconButton name="link" onClick={onCreateLink} title="将链接复制到剪贴板" />}
      <IconButton name="trash-alt" title={'删除查询'} onClick={onDeleteQuery} />
      <IconButton
        name={query.starred ? 'favorite' : 'star'}
        iconType={query.starred ? 'mono' : 'default'}
        onClick={onStarrQuery}
        title={query.starred ? '去星标' : '加星标'}
      />
    </div>
  );

  return (
    <div className={styles.queryCard} onKeyDown={onKeyDown}>
      <div className={styles.cardRow}>
        <div className={styles.datasourceContainer}>
          <img src={dsImg} aria-label="Data source icon" />
          <div aria-label="Data source name">{isRemoved ? '数据源不再存在' : query.datasourceName}</div>
        </div>
        {queryActionButtons}
      </div>
      <div className={cx(styles.cardRow)}>
        <div className={styles.queryContainer}>
          {query.queries.map((q, i) => {
            const queryText = createQueryText(q, queryDsInstance);
            return (
              <div aria-label="Query text" key={`${q}-${i}`} className={styles.queryRow}>
                {queryText}
              </div>
            );
          })}
          {!activeUpdateComment && query.comment && (
            <div aria-label="Query comment" className={styles.comment}>
              {query.comment}
            </div>
          )}
          {activeUpdateComment && updateComment}
        </div>
        {!activeUpdateComment && (
          <div className={styles.runButton}>
            <Button variant="secondary" onClick={onRunQuery} disabled={isRemoved}>
              {datasourceInstance?.name === query.datasourceName ? '执行查询' : '切换数据源并运行查询'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function mapStateToProps(state: StoreState, { exploreId }: { exploreId: ExploreId }) {
  const explore = state.explore;
  const { datasourceInstance } = explore[exploreId];
  // @ts-ignore
  const item: ExploreItemState = explore[exploreId];
  return {
    exploreId,
    datasourceInstance,
  };
}

const mapDispatchToProps = {
  changeDatasource,
  updateRichHistory,
  setQueries,
};

export default hot(module)(connect(mapStateToProps, mapDispatchToProps)(RichHistoryCard));
