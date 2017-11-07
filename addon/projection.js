import Ember from 'ember';
import SchemaManager from './schema-manager';
import MegamorphicModel from './model';

const { get, set } = Ember;

export default class Projection extends Ember.Object {
  init() {
    // TODO Figure out what to doV with the state
    this._super(...arguments);
    this.id = this._parentModel.id;
    this._schema = SchemaManager;
  }

  unknownProperty(key) {
    if (! this._schema.isAttributeIncluded(this._projectionName, key)) { return; }
    let value = get(this._parentModel, key);
    if (!(value instanceof MegamorphicModel)) {
      // not a M3 model, cannot do much
      return value;
    }
    let projectionType = this._schema.computeProjectionType(key, this._projectionName);
    return value.getProjection(projectionType);
  }

  setUnknownProperty(key, value) {
    if (! this._schema.isAttributeIncluded(this._projectionName, key)) { return; }
    set(this._parentModel, key, value);
    // TODO nested models are problematic as they need to be merged and not replaced
  }

  _notifyProperties(keys) {
    for (let i = 0; i < keys.length; i++) {
      if (this._schema.isAttributeIncluded(this._projectionName, keys[i])) {
        this.notifyPropertyChange(keys[i]);
      }
    }
  }
}

Projection.prototype._projectionName = null;
Projection.prototype._parentModel = null;
