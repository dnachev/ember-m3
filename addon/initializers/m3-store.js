import Ember from 'ember';
import DS from 'ember-data';
import { InternalModel } from 'ember-data/-private';

import MegamorphicModel from '../model';
import MegamorphicModelFactory from '../factory';
import SchemaManager from '../schema-manager';
import QueryCache from '../query-cache';

// const { assign, isEqual } = Ember;
const { assert } = Ember;

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

    _buildInternalModel(modelName, id, data) {
      if (!SchemaManager.includesModel(modelName)) {
        return this._super(modelName, id, data);
      }
      assert(`You can no longer pass a modelClass as the first argument to store._buildInternalModel. Pass modelName instead.`, typeof modelName === 'string');

      let existingInternalModel = this._existingInternalModelForId(modelName, id);

      // TODO This assert must cover the base model, not only the immediate type
      assert(`The id ${id} has already been used with another record for modelClass '${modelName}'.`, !existingInternalModel);

      let internalModel = this._globalM3Cache[id];

      // TODO Correctly set the base modelName, do we need still? Depends on where it is used
      let baseModelName = SchemaManager.resolveModelName(modelName);

      if (!internalModel) {
        // lookupFactory should really return an object that creates
        // instances with the injections applied
        internalModel = new InternalModel(baseModelName, id, this, data);
      }

      this._internalModelsFor(modelName).add(internalModel, id);

      return internalModel;
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
      if (jsonAPIResource.subTypes) {
        let subTypes = jsonAPIResource.subTypes;
        for (let i = 0; i < subTypes.length; i++) {
          let internalModels = this._internalModelsFor(subTypes[i]);
          if (internalModels.has(jsonAPIResource.id)) {
            continue;
          }
          internalModels.add(internalModel, jsonAPIResource.id);
        }
      }
      return internalModel;
    },

    _internalModelDestroyed(internalModel) {
      delete this._globalM3Cache[internalModel.id];
      return this._super(internalModel);
    },
  })
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
