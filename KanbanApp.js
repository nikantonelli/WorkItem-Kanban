(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Niks.Apps.DefectSuiteKanban', {
        extend: 'Rally.app.App',
        requires: [
            'Rally.apps.kanban.Settings',
            'Rally.apps.kanban.Column',
            'Rally.ui.gridboard.GridBoard',
            'Rally.ui.gridboard.plugin.GridBoardAddNew',
            'Rally.ui.gridboard.plugin.BoardPolicyDisplayable',
            'Rally.ui.cardboard.plugin.ColumnPolicy',
            'Rally.ui.cardboard.PolicyContainer',
            'Rally.ui.cardboard.CardBoard',
            'Rally.ui.cardboard.plugin.Scrollable',
            'Rally.ui.report.StandardReport',
            'Rally.clientmetrics.ClientMetricsRecordable',
            'Rally.ui.gridboard.plugin.GridBoardCustomFilterControl',
            'Rally.ui.gridboard.plugin.GridBoardFieldPicker',
            'Rally.ui.cardboard.plugin.FixedHeader'
        ],
        mixins: [
            'Rally.clientmetrics.ClientMetricsRecordable'
        ],
        cls: 'kanban',
        alias: 'widget.kanbanapp',
        appName: 'Kanban',
        itemId:'Kanban',
        helpId: 238,

        settingsScope: 'project',
        autoScroll: false,
        layout: 'fit',

        config: {
            defaultSettings: {
                enabledModels: ['UserStory'],
                groupByField: 'ScheduleState',
                showRows: false,
                columns: Ext.JSON.encode({
                    Defined: {wip: ''},
                    'In-Progress': {wip: ''},
                    Completed: {wip: ''},
                    Accepted: {wip: ''}
                }),
                cardFields: 'FormattedID,Name,Owner,Discussion,Tasks,Defects', //remove with COLUMN_LEVEL_FIELD_PICKER_ON_KANBAN_SETTINGS
                hideReleasedCards: false,
                hideOldCards: false,
                showCardAge: true,
                cardAgeThreshold: 3,
                pageSize: 2000
            }
        },

        _getSelectedModels: function() {
            var setting = this.getSetting('enabledModels');
            if (typeof setting === 'string') { setting = setting.split(",");}
            return setting;
        },

        launch: function() {

            var models = this._getSelectedModels();
            if (models.length === 0) {
                models = ['UserStory'];   //Can't have 'nothing'
            }
            Rally.data.ModelFactory.getModel({
                type: models[0],
                success: this._onStoryModelRetrieved,
                failure: function(error) {
                    console.log('Failed to fetch model: ', error);
                },
                scope: this
            });
        },

        getOptions: function() {
            return [
                {
                    text: 'Show Cycle Time Report',
                    handler: this._showCycleTimeReport,
                    scope: this
                },
                {
                    text: 'Show Throughput Report',
                    handler: this._showThroughputReport,
                    scope: this
                },
                {
                    text: 'Print',
                    handler: this._print,
                    scope: this
                }
            ];
        },

        getSettingsFields: function() {
            return [{
                name: 'enabledModels',
                fieldLabel: 'Card Types',
                xtype: 'rallycombobox',
                multiSelect: true,
                displayField: 'name',
                valueField: 'name',
                storeType: 'Ext.data.Store',
                stateful: true,
                stateId: this.getContext().getScopedStateId('cardTypeSelector'),
                storeConfig: {
                    remoteFilter: false,
                    fields: ['name'],
                    data: [
                        { 'name': 'DefectSuite'},
                        { 'name': 'Defect'},
                        { 'name': 'UserStory'},
                        { 'name': 'TestSet'},
                        { 'name': 'Risk'}
                    ],
                },
            }].concat(Rally.apps.kanban.Settings.getFields({
                shouldShowColumnLevelFieldPicker: this._shouldShowColumnLevelFieldPicker(),
                defaultCardFields: this.getSetting('cardFields')
            }));
        },

        /**
         * Called when any timebox scope change is received.
         * @protected
         * @param {Rally.app.TimeboxScope} timeboxScope The new scope
         */
        onTimeboxScopeChange: function() {
            this.callParent(arguments);
            this.gridboard.destroy();
            this.launch();
        },

        onSettingsUpdate: function() {
            if ( this.gridboard) { this.gridboard.destroy();}
            this.launch();
        },

        _shouldShowColumnLevelFieldPicker: function() {
            return this.getContext().isFeatureEnabled('COLUMN_LEVEL_FIELD_PICKER_ON_KANBAN_SETTINGS');
        },

        _onStoryModelRetrieved: function(model) {
            this.groupByField = model.getField(this.getSetting('groupByField'));
            this._addCardboardContent();
        },

        _addCardboardContent: function() {
            var cardboardConfig = this._getCardboardConfig();

            var columnSetting = this._getColumnSetting();
            if (columnSetting) {
                cardboardConfig.columns = this._getColumnConfig(columnSetting);
            }

            this.gridboard = this.add(this._getGridboardConfig(cardboardConfig));
        },

        _getGridboardConfig: function(cardboardConfig) {
            var me =this;
            var context = this.getContext(),
                modelNames = this._getDefaultTypes(),
                blackListFields = ['Successors', 'Predecessors', 'DisplayColor'],
                whiteListFields = ['Milestones', 'Tags'];
           
            return {
                xtype: 'rallygridboard',
                stateful: false,
                toggleState: 'board',
                cardBoardConfig: cardboardConfig,
                plugins: [
                    {
                        ptype: 'rallygridboardaddnew',
                        addNewControlConfig: {
                            listeners: {
                                beforecreate: this._onBeforeCreate,
                                beforeeditorshow: this._onBeforeEditorShow,
                                scope: this
                            },
                            stateful: true,
                            stateId: context.getScopedStateId('kanban-add-new'),
                            modelNames: me._getSelectedModels() 
                        }
                    },
                    {
                        ptype: 'rallygridboardinlinefiltercontrol',
                        inlineFilterButtonConfig: {
                            stateful: true,
                            stateId: context.getScopedStateId('kanban-inline-filter'),
                            modelNames: modelNames,
                            legacyStateIds: [
                                context.getScopedStateId('kanban-owner-filter'),
                                context.getScopedStateId('kanban-custom-filter-button')
                            ],
                            filterChildren: true,
                            inlineFilterPanelConfig: {
                                quickFilterPanelConfig: {
                                    defaultFields: ['ArtifactSearch', 'Owner'],
                                    addQuickFilterConfig: {
                                        blackListFields: blackListFields,
                                        whiteListFields: whiteListFields
                                    }
                                },
                                advancedFilterPanelConfig: {
                                    advancedFilterRowsConfig: {
                                        propertyFieldConfig: {
                                            blackListFields: blackListFields,
                                            whiteListFields: whiteListFields
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        ptype: 'rallygridboardfieldpicker',
                        headerPosition: 'left',
                        boardFieldBlackList: blackListFields,
                        modelNames: modelNames
                    },
                    {
                        ptype: 'rallyboardpolicydisplayable',
                        prefKey: 'kanbanAgreementsChecked',
                        checkboxConfig: {
                            boxLabel: 'Show Agreements'
                        }
                    }
                ],
                context: context,
                modelNames: modelNames,
                storeConfig: {
                    filters: this._getFilters()
                },
                height: this.getHeight()
            };
        },

        _getColumnConfig: function(columnSetting) {
            var columns = [];
            Ext.Object.each(columnSetting, function(column, values) {
                var columnConfig = {
                    xtype: 'kanbancolumn',
                    enableWipLimit: true,
                    wipLimit: values.wip,
                    plugins: [{
                        ptype: 'rallycolumnpolicy',
                        app: this
                    }],
                    value: column,
                    columnHeaderConfig: {
                        headerTpl: column || 'None'
                    },
                    listeners: {
                        invalidfilter: {
                            fn: this._onInvalidFilter,
                            scope: this
                        }
                    }
                };
                if(this._shouldShowColumnLevelFieldPicker()) {
                    columnConfig.fields = this._getFieldsForColumn(values);
                }
                columns.push(columnConfig);
            }, this);

            columns[columns.length - 1].hideReleasedCards = this.getSetting('hideReleasedCards');
            columns[columns.length - 1].hideOldCards = this.getSetting('hideOldCards');

            return columns;
        },

        _getFieldsForColumn: function(values) {
            var columnFields = [];
            if (this._shouldShowColumnLevelFieldPicker()) {
                if (values.cardFields) {
                    columnFields = values.cardFields.split(',');
                } else if (this.getSetting('cardFields')) {
                    columnFields = this.getSetting('cardFields').split(',');
                }
            }
            return columnFields;
        },

        _onInvalidFilter: function() {
            Rally.ui.notify.Notifier.showError({
                message: 'Invalid query: ' + this.getSetting('query')
            });
        },

        _getCardboardConfig: function() {
            var config = {
                xtype: 'rallycardboard',
                plugins: [
                    {
                        ptype: 'rallycardboardprinting',
                        pluginId: 'print'
                    },
                    {
                        ptype: 'rallyscrollablecardboard',
                        containerEl: this.getEl()
                    },
                    {ptype: 'rallyfixedheadercardboard'}
                ],
                types: this._getDefaultTypes(),
                attribute: this.getSetting('groupByField'),
                margin: '10px',
                context: this.getContext(),
                listeners: {
                    beforecarddroppedsave: this._onBeforeCardSaved,
                    load: this._onBoardLoad,
                    cardupdated: this._publishContentUpdatedNoDashboardLayout,
                    scope: this
                },
                columnConfig: {
                    xtype: 'rallycardboardcolumn',
                    enableWipLimit: true,
                    fields: this.getSetting('cardFields').split(',')
                },
                cardConfig: {
                    editable: true,
                    showIconMenus: true,
                    showAge: this.getSetting('showCardAge') ? this.getSetting('cardAgeThreshold') : -1,
                    showBlockedReason: true
                },
                storeConfig: {
                    context: this.getContext().getDataContext(),
                    pageSize: 2000
                },
            };
            if (this.getSetting('showRows')) {
                Ext.merge(config, {
                    rowConfig: {
                        field: this.getSetting('rowsField'),
                        sortDirection: 'ASC',
                        sortField: 'DragAndDropRank'
                    }
                });
            }
            return config;
        },


        _getFilters: function() {
            var filters = [];
            if(this.getSetting('query')) {
                filters.push(Rally.data.QueryFilter.fromQueryString(this.getSetting('query')));
            }
            if(this.getContext().getTimeboxScope()) {
                filters.push(this.getContext().getTimeboxScope().getQueryFilter());
            }
            return filters;
        },

        _getColumnSetting: function() {
            var columnSetting = this.getSetting('columns');
            return columnSetting && Ext.JSON.decode(columnSetting);
        },

        _buildReportConfig: function(report) {
            var reportConfig = {
                report: report,
                work_items: this._getWorkItemTypesForChart()
            };
            if (this.getSetting('groupByField') !== 'ScheduleState') {
                reportConfig.filter_field = this.groupByField.displayName;
            }
            return reportConfig;
        },

        _showCycleTimeReport: function() {
            this._showReportDialog('Cycle Time Report',
                this._buildReportConfig(Rally.ui.report.StandardReport.Reports.CycleLeadTime));
        },

        _showThroughputReport: function() {
            this._showReportDialog('Throughput Report',
                this._buildReportConfig(Rally.ui.report.StandardReport.Reports.Throughput));
        },

        _print: function() {
            this.gridboard.getGridOrBoard().openPrintPage({title: 'Kanban Board'});
        },

        _getWorkItemTypesForChart: function() {
            var types = this.gridboard.getGridOrBoard().getTypes(),
                typeMap = {
                    hierarchicalrequirement: 'G',
                    defect: 'D'
                };
            return types.length === 2 ? 'N' : typeMap[types[0]];
        },

        _getDefaultTypes: function() {
            return this._getSelectedModels();
        },

        _buildStandardReportConfig: function(reportConfig) {
            var scope = this.getContext().getDataContext();
            return {
                xtype: 'rallystandardreport',
                padding: 10,
                project: scope.project,
                projectScopeUp: scope.projectScopeUp,
                projectScopeDown: scope.projectScopeDown,
                reportConfig: reportConfig
            };
        },

        _showReportDialog: function(title, reportConfig) {
            var height = 450, width = 600;
            this.getEl().mask();
            Ext.create('Rally.ui.dialog.Dialog', {
                title: title,
                autoShow: true,
                draggable: false,
                closable: true,
                modal: false,
                height: height,
                width: width,
                items: [
                    Ext.apply(this._buildStandardReportConfig(reportConfig),
                        {
                            height: height,
                            width: width
                        })
                ],
                listeners: {
                    close: function() {
                        this.getEl().unmask();
                    },
                    scope: this
                }
            });
        },

        _onBoardLoad: function() {
            this._publishContentUpdated();
            this.setLoading(false);
        },

        _onBeforeCreate: function(addNew, record, params) {
            Ext.apply(params, {
                rankTo: 'BOTTOM',
                rankScope: 'BACKLOG'
            });
            record.set(this.getSetting('groupByField'), this.gridboard.getGridOrBoard().getColumns()[0].getValue());
        },

        _onBeforeEditorShow: function(addNew, params) {
            params.rankTo = 'BOTTOM';
            params.rankScope = 'BACKLOG';
            params.iteration = 'u';

            var groupByFieldName = this.groupByField.name;

            params[groupByFieldName] = this.gridboard.getGridOrBoard().getColumns()[0].getValue();
        },

        _onBeforeCardSaved: function(column, card) {
            var columnSetting = this._getColumnSetting();
            if (columnSetting) {
                var setting = columnSetting[column.getValue()];
                if (setting && setting.scheduleStateMapping) {
                    card.getRecord().set('ScheduleState', setting.scheduleStateMapping);
                }
            }
        },

        _publishContentUpdated: function() {
            this.fireEvent('contentupdated');
            if (Rally.BrowserTest) {
                Rally.BrowserTest.publishComponentReady(this);
            }
            this.recordComponentReady({
                miscData: {
                    swimLanes: this.getSetting('showRows'),
                    swimLaneField: this.getSetting('rowsField')
                }
            });
        },

        _publishContentUpdatedNoDashboardLayout: function() {
            this.fireEvent('contentupdated', {dashboardLayout: false});
        }
    });
})();
