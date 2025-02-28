import React, { PureComponent } from 'react';
import { selectors as e2eSelectors } from '@grafana/e2e-selectors';
import { LegacyForms, ClipboardButton, Icon, InfoBox } from '@grafana/ui';
const { Select, Switch } = LegacyForms;
import { SelectableValue, PanelModel, AppEvents } from '@grafana/data';
import { DashboardModel } from 'app/features/dashboard/state';
import { buildImageUrl, buildShareUrl } from './utils';
import { appEvents } from 'app/core/core';
import config from 'app/core/config';

const themeOptions: Array<SelectableValue<string>> = [
  { label: 'current', value: 'current' },
  { label: 'dark', value: 'dark' },
  { label: 'light', value: 'light' },
];

export interface Props {
  dashboard: DashboardModel;
  panel?: PanelModel;
}

export interface State {
  useCurrentTimeRange: boolean;
  includeTemplateVars: boolean;
  selectedTheme: SelectableValue<string>;
  shareUrl: string;
  imageUrl: string;
}

export class ShareLink extends PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      useCurrentTimeRange: true,
      includeTemplateVars: true,
      selectedTheme: themeOptions[0],
      shareUrl: '',
      imageUrl: '',
    };
  }

  componentDidMount() {
    this.buildUrl();
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    const { useCurrentTimeRange, includeTemplateVars, selectedTheme } = this.state;
    if (
      prevState.useCurrentTimeRange !== useCurrentTimeRange ||
      prevState.includeTemplateVars !== includeTemplateVars ||
      prevState.selectedTheme.value !== selectedTheme.value
    ) {
      this.buildUrl();
    }
  }

  buildUrl = () => {
    const { panel } = this.props;
    const { useCurrentTimeRange, includeTemplateVars, selectedTheme } = this.state;

    const shareUrl = buildShareUrl(useCurrentTimeRange, includeTemplateVars, selectedTheme.value, panel);
    const imageUrl = buildImageUrl(useCurrentTimeRange, includeTemplateVars, selectedTheme.value, panel);
    this.setState({ shareUrl, imageUrl });
  };

  onUseCurrentTimeRangeChange = () => {
    this.setState({ useCurrentTimeRange: !this.state.useCurrentTimeRange });
  };

  onIncludeTemplateVarsChange = () => {
    this.setState({ includeTemplateVars: !this.state.includeTemplateVars });
  };

  onThemeChange = (value: SelectableValue<string>) => {
    this.setState({ selectedTheme: value });
  };

  onShareUrlCopy = () => {
    appEvents.emit(AppEvents.alertSuccess, ['内容已复制到剪贴板']);
  };

  getShareUrl = () => {
    return this.state.shareUrl;
  };

  render() {
    const { panel } = this.props;
    const { useCurrentTimeRange, includeTemplateVars, selectedTheme, shareUrl, imageUrl } = this.state;
    const selectors = e2eSelectors.pages.SharePanelModal;

    return (
      <div className="share-modal-body">
        <div className="share-modal-header">
          <Icon name="link" className="share-modal-big-icon" size="xxl" />
          <div className="share-modal-content">
            <p className="share-modal-info-text">使用以下选项自定义指向该仪表板或面板的直接链接。 </p>
            <div className="gf-form-group">
              <Switch
                labelClass="width-12"
                label="当前时间范围"
                checked={useCurrentTimeRange}
                onChange={this.onUseCurrentTimeRangeChange}
              />
              <Switch
                labelClass="width-12"
                label="模板变量"
                checked={includeTemplateVars}
                onChange={this.onIncludeTemplateVarsChange}
              />
              <div className="gf-form">
                <label className="gf-form-label width-12">主题</label>
                <Select width={10} options={themeOptions} value={selectedTheme} onChange={this.onThemeChange} />
              </div>
            </div>
            <div>
              <div className="gf-form-group">
                <div className="gf-form-inline">
                  <div className="gf-form gf-form--grow">
                    <input type="text" className="gf-form-input" defaultValue={shareUrl} />
                  </div>
                  <div className="gf-form">
                    <ClipboardButton variant="primary" getText={this.getShareUrl} onClipboardCopy={this.onShareUrlCopy}>
                      复制
                    </ClipboardButton>
                  </div>
                </div>
              </div>
            </div>
            {panel && config.rendererAvailable && (
              <div className="gf-form">
                <a href={imageUrl} target="_blank" aria-label={selectors.linkToRenderedImage}>
                  <Icon name="camera" /> 直接链接渲染图像
                </a>
              </div>
            )}
            {panel && !config.rendererAvailable && (
              <InfoBox>
                <p>
                  <>要渲染面板图像，必须安装 </>
                  <a
                    href="https://grafana.com/grafana/plugins/grafana-image-renderer"
                    target="_blank"
                    rel="noopener"
                    className="external-link"
                  >
                    Grafana Image Renderer插件。
                  </a>
                  请与您的Grafana管理员联系以安装插件。
                </p>
              </InfoBox>
            )}
          </div>
        </div>
      </div>
    );
  }
}
