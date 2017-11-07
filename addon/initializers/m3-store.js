import Ember from 'ember';
import DS from 'ember-data';

import MegamorphicModel from '../model';
import MegamorphicModelFactory from '../factory';
import SchemaManager from '../schema-manager';
import QueryCache from '../query-cache';

// TODO: this is a stopgap.  We want to replace this with a public
// DS.Model/Schema API

export function extendStore(Store) {
  Store.reopen({
    init() {
      this._super(...arguments);
      this._queryCache = new QueryCache({ store: this });
      this._globalM3Cache = new Object(null);
    },

    _hasModelFor(modelName) {
      return SchemaManager.includesModel(modelName) || this._super(modelName);
    },

    modelFactoryFor(modelName) {
      if (SchemaManager.includesModel(modelName)) {
        return MegamorphicModelFactory;
      }
      return this._super(modelName);
    },

    adapterFor(modelName) {
      if (SchemaManager.includesModel(modelName)) {
        return this._super('-ember-m3');
      }
      return this._super(modelName);
    },

    serializerFor(modelName) {
      if (SchemaManager.includesModel(modelName)) {
        return this._super('-ember-m3');
      }
      return this._super(modelName);
    },

    queryURL(url, options) {
      return this._queryCache.queryURL(url, options);
    },

    unloadURL(cacheKey) {
      return this._queryCache.unloadURL(cacheKey);
    },

    containsURL(cacheKey) {
      return this._queryCache.contains(cacheKey);
    },

    _pushInternalModel(jsonAPIResource) {
      let internalModel = this._super(jsonAPIResource);
      if (SchemaManager.includesModel(jsonAPIResource.type)) {
        this._globalM3Cache[internalModel.id] = internalModel;
      }
      return internalModel;
    },

    _internalModelDestroyed(internalModel) {
      delete this._globalM3Cache[internalModel.id];
      return this._super(internalModel);
    },

    findRecord(modelName, id, options) {
      const resolvedModelName = SchemaManager.resolveProjectionName(modelName);
      if (!resolvedModelName) {
        return this._super(modelName, id, options);
      }
      let adapterOptions = {
        projectionName: modelName,
      };
      if (options && options.adapterOptions) {
        adapterOptions = Object.assign(adapterOptions, options.adapterOptions);
      }

      const baseModel = this._super(resolvedModelName, id, Object.assign(options || {}, {
        adapterOptions,
      }));
      // TODO Get into PromiseProxy business
      return baseModel.then((record) => record.getProjection(modelName));
    }
  });
}

export function extendDataAdapter(DataAdapter) {
  DataAdapter.reopen({
    getModelTypes() {
      return this._super(...arguments).concat({
        klass: MegamorphicModel,
        name: '-ember-m3'
      });
    },

    _nameToClass(modelName) {
      if (SchemaManager.includesModel(modelName)) {
        return MegamorphicModel;
      }
      return this._super(...arguments);
    }
  });
}

export function initialize() {
  extendStore(DS.Store);
  extendDataAdapter(Ember.DataAdapter);
}

export default {
  name: 'm3-store',
  initialize,
  after: 'm3-schema-initializer',
};
