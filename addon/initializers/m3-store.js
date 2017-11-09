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
      // TODO Fix the handling of the m3 global cache to correctly handle projected types
      // the cache must work only for 
      if (SchemaManager.includesModel(jsonAPIResource.type)) {
        this._globalM3Cache[internalModel.id] = internalModel;
      }
      if (!jsonAPIResource.projectionTypes) {
        return internalModel;
      }
      // model has been loaded with projections
      // push dummy internal models for the projections
      let projectionTypes = jsonAPIResource.projectionTypes;
      let internalModels = new Array(projectionTypes.length);
      for (let i = 0; i < projectionTypes.length; i++) {
        let projectionData = {
          id: jsonAPIResource.id,
          type: projectionTypes[i],
          attributes: {
            __projects: jsonAPIResource.type
          }
        };
        internalModels[i] = this._load(projectionData);
      }
      // invalidate the load state of the main internal model - figure out how the proj M3 will peek the record
      // _pushInternalModel is invoked always for single resource, but with projectionTypes we can encode multiple records
      // projection of the same data, we don't know which one is the top one - for now we will assume it is the first entry
      return internalModels[0];
    },

    _internalModelDestroyed(internalModel) {
      delete this._globalM3Cache[internalModel.id];
      return this._super(internalModel);
    },
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
