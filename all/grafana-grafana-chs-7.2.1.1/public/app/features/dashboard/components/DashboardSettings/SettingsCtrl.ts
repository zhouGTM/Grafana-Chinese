import _ from 'lodash';
import angular, { ILocationService, IScope } from 'angular';
import { selectors } from '@grafana/e2e-selectors';

import { appEvents, contextSrv, coreModule } from 'app/core/core';
import { DashboardModel } from '../../state/DashboardModel';
import { DashboardSrv } from '../../services/DashboardSrv';
import { CoreEvents } from 'app/types';
import { GrafanaRootScope } from 'app/routes/GrafanaCtrl';
import { AppEvents, locationUtil, TimeZone, urlUtil } from '@grafana/data';
import { promiseToDigest } from '../../../../core/utils/promiseToDigest';
import { deleteDashboard } from 'app/features/manage-dashboards/state/actions';

export class SettingsCtrl {
  dashboard: DashboardModel;
  isOpen: boolean;
  viewId: string;
  json: string;
  alertCount: number;
  canSaveAs: boolean;
  canSave?: boolean;
  canDelete?: boolean;
  sections: any[];
  hasUnsavedFolderChange: boolean;
  selectors: typeof selectors.pages.Dashboard.Settings.General;
  renderCount: number; // hack to update React when Angular changes

  /** @ngInject */
  constructor(
    private $scope: IScope & Record<string, any>,
    private $route: any,
    private $location: ILocationService,
    private $rootScope: GrafanaRootScope,
    private dashboardSrv: DashboardSrv
  ) {
    // temp hack for annotations and variables editors
    // that rely on inherited scope
    $scope.dashboard = this.dashboard;

    this.$scope.$on('$destroy', () => {
      this.dashboard.updateSubmenuVisibility();
      setTimeout(() => {
        this.$rootScope.appEvent(CoreEvents.dashScroll, { restore: true });
        this.dashboard.startRefresh();
      });
    });

    this.canSaveAs = contextSrv.hasEditPermissionInFolders;
    this.canSave = this.dashboard.meta.canSave;
    this.canDelete = this.dashboard.meta.canSave;

    this.buildSectionList();
    this.onRouteUpdated();

    this.$rootScope.onAppEvent(CoreEvents.routeUpdated, this.onRouteUpdated.bind(this), $scope);
    this.$rootScope.appEvent(CoreEvents.dashScroll, { animate: false, pos: 0 });

    appEvents.on(CoreEvents.dashboardSaved, this.onPostSave.bind(this), $scope);

    this.selectors = selectors.pages.Dashboard.Settings.General;
    this.renderCount = 0;
  }

  buildSectionList() {
    this.sections = [];

    if (this.dashboard.meta.canEdit) {
      this.sections.push({
        title: '通常',
        id: 'settings',
        icon: 'sliders-v-alt',
      });
      this.sections.push({
        title: '注释',
        id: 'annotations',
        icon: 'comment-alt',
      });
      this.sections.push({
        title: '变量',
        id: 'templating',
        icon: 'calculator-alt',
      });
      this.sections.push({
        title: '链接',
        id: 'links',
        icon: 'link',
      });
    }

    if (this.dashboard.id && this.dashboard.meta.canSave) {
      this.sections.push({
        title: '版本',
        id: 'versions',
        icon: 'history',
      });
    }

    if (this.dashboard.id && this.dashboard.meta.canAdmin) {
      this.sections.push({
        title: '权限',
        id: 'permissions',
        icon: 'lock',
      });
    }

    if (this.dashboard.meta.canMakeEditable) {
      this.sections.push({
        title: '通常',
        icon: 'sliders-v-alt',
        id: 'make_editable',
      });
    }

    this.sections.push({
      title: 'JSON模型',
      id: 'dashboard_json',
      icon: 'arrow',
    });

    const params = this.$location.search();
    const url = this.$location.path();

    for (const section of this.sections) {
      section.url = locationUtil.assureBaseUrl(urlUtil.renderUrl(url, { ...params, editview: section.id }));
    }
  }

  onRouteUpdated() {
    this.viewId = this.$location.search().editview;

    if (this.viewId) {
      this.json = angular.toJson(this.dashboard.getSaveModelClone(), true);
    }

    if (this.viewId === 'settings' && this.dashboard.meta.canMakeEditable) {
      this.viewId = 'make_editable';
    }

    const currentSection: any = _.find(this.sections, { id: this.viewId } as any);
    if (!currentSection) {
      this.sections.unshift({
        title: '未找到',
        id: '404',
        icon: 'exclamation-triangle',
      });
      this.viewId = '404';
    }
  }
  saveDashboardJson() {
    this.dashboardSrv.saveJSONDashboard(this.json).then(() => {
      this.$route.reload();
    });
  }

  onPostSave() {
    this.hasUnsavedFolderChange = false;
  }

  hideSettings() {
    const urlParams = this.$location.search();
    delete urlParams.editview;
    setTimeout(() => {
      this.$rootScope.$apply(() => {
        this.$location.search(urlParams);
      });
    });
  }

  makeEditable() {
    this.dashboard.editable = true;
    this.dashboard.meta.canMakeEditable = false;
    this.dashboard.meta.canEdit = true;
    this.dashboard.meta.canSave = true;
    this.canDelete = true;
    this.viewId = 'settings';
    this.buildSectionList();

    const currentSection: any = _.find(this.sections, { id: this.viewId } as any);
    this.$location.url(locationUtil.stripBaseFromUrl(currentSection.url));
  }

  deleteDashboard() {
    let confirmText = '';
    let text2 = this.dashboard.title;

    if (this.dashboard.meta.provisioned) {
      appEvents.emit(CoreEvents.showConfirmModal, {
        title: '无法删除预配置的信息中心',
        text: `
        此仪表板由Grafanas设置管理，无法删除。 从配置文件中删除仪表板以将其删除。
        `,
        text2: `
        <i>请参见<a class="external-link" href="http://docs.grafana.org/administration/provisioning/#dashboards" target="_blank">
        文档</a>以获取有关配置的更多信息。</ i> </br>
          文件路径: ${this.dashboard.meta.provisionedExternalId}
        `,
        text2htmlBind: true,
        icon: 'trash-alt',
        noText: 'OK',
      });
      return;
    }

    const alerts = _.sumBy(this.dashboard.panels, panel => {
      return panel.alert ? 1 : 0;
    });

    if (alerts > 0) {
      confirmText = 'DELETE';
      text2 = `此信息中心包含 ${alerts} 个警报。 删除此仪表板也将删除那些警报`;
    }

    appEvents.emit(CoreEvents.showConfirmModal, {
      title: '删除',
      text: '您是否要删除此仪表板?',
      text2: text2,
      icon: 'trash-alt',
      confirmText: confirmText,
      yesText: '删除',
      onConfirm: () => {
        this.dashboard.meta.canSave = false;
        this.deleteDashboardConfirmed();
      },
    });
  }

  deleteDashboardConfirmed() {
    promiseToDigest(this.$scope)(
      deleteDashboard(this.dashboard.uid, false).then(() => {
        appEvents.emit(AppEvents.alertSuccess, ['仪表板删除', this.dashboard.title + ' 已删除']);
        this.$location.url('/');
      })
    );
  }

  onFolderChange = (folder: { id: number; title: string }) => {
    this.dashboard.meta.folderId = folder.id;
    this.dashboard.meta.folderTitle = folder.title;
    this.hasUnsavedFolderChange = true;
  };

  getFolder() {
    return {
      id: this.dashboard.meta.folderId,
      title: this.dashboard.meta.folderTitle,
      url: this.dashboard.meta.folderUrl,
    };
  }

  getDashboard = () => {
    return this.dashboard;
  };

  onRefreshIntervalChange = (intervals: string[]) => {
    this.dashboard.timepicker.refresh_intervals = intervals.filter(i => i.trim() !== '');
    this.renderCount++;
  };

  onNowDelayChange = (nowDelay: string) => {
    this.dashboard.timepicker.nowDelay = nowDelay;
    this.renderCount++;
  };

  onHideTimePickerChange = (hide: boolean) => {
    this.dashboard.timepicker.hidden = hide;
    this.renderCount++;
  };

  onTimeZoneChange = (timeZone: TimeZone) => {
    this.dashboard.timezone = timeZone;
    this.renderCount++;
  };
}

export function dashboardSettings() {
  return {
    restrict: 'E',
    templateUrl: 'public/app/features/dashboard/components/DashboardSettings/template.html',
    controller: SettingsCtrl,
    bindToController: true,
    controllerAs: 'ctrl',
    transclude: true,
    scope: { dashboard: '=' },
  };
}

coreModule.directive('dashboardSettings', dashboardSettings);
