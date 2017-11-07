import { test } from 'qunit';
import { default as moduleFor }  from 'ember-qunit/module-for';
import sinon from 'sinon';

import Ember from 'ember';

import SchemaManager from 'ember-m3/schema-manager';
import { initialize as initializeStore } from 'ember-m3/initializers/m3-store';

const { addObserver, get, run, RSVP: { Promise, } } = Ember;

const PersonTypeName = 'com.example.models.Person';
const CompactPersonTypeName = 'com.example.projections.CompactPerson';

function overrideType(payload, type) {
  let newPayload = Ember.copy(payload, true);
  newPayload.data.projectionTypes = [].concat(type);
  return newPayload;
}

const initialPayload = {
  data: {
    id: '1',
    type: PersonTypeName,
    attributes: {
      name: 'Tom Dale',
      description: 'JavaScript thinkfluencer',
      address: {
        street: '1000 W Maude Ave',
        country: 'US'
      }
    }
  }
};

const updatePayload = {
  data: {
    id: '1',
    type: PersonTypeName,
    attributes: {
      name: 'Yehuda Katz',
      description: 'Tilde Co-Founder, OSS enthusiast and world traveler.'
    }
  }
};


moduleFor('m3:store', 'integration/deco', {
  integration: true,

  beforeEach() {
    this.sinon = sinon.sandbox.create();
    initializeStore(this);

    SchemaManager.registerSchema({
      includesModel(modelName) {
        return /^com.example.models\./i.test(modelName) || /^com.example.projections\./i.test(modelName);
      },

      computeAttributeReference() {
        return null;
      },

      isAttributeArrayReference() {
        return false;
      },

      computeNestedModel(key, value) {
        if (!value || typeof value !== 'object' || value.constructor === Date) {
          return null;
        }
        return {
          type: value.type,
          id: value.id,
          attributes: value,
        }
      },

      models: {
        'com.example.projections.CompactPerson': {
          projects: 'com.example.models.Person',
          attributes: [ 'name', 'address' ],
          attributesTypes: {
            address: 'com.example.projections.CountryOnly',
          }
        },
        'com.example.projections.CountryOnly': {
          attributes: [ 'country' ],
        }
      },
    });

    let projectionCache = Object.create(null);

    let baseAdapter = this.adapter();

    baseAdapter.isProjectionLoaded = function projectionIsLoaded(modelName, id) {
      let cacheKey = `${modelName}:${id}`;
      return cacheKey in projectionCache;
    };

    let superReloadRecord = baseAdapter.shouldReloadRecord;
    baseAdapter.shouldReloadRecord = function shouldReloadProjection(store, snapshot) {
      if (!snapshot.adapterOptions || !snapshot.adapterOptions.projectionName) {
        return superReloadRecord.apply(this, arguments);
      }
      return !this.isProjectionLoaded(snapshot.adapterOptions.projectionName, snapshot.id);
    };

    let superFindRecord = baseAdapter.findRecord;
    baseAdapter.findRecord = function projectionFindRecord(store, modelClass, id, snapshot) {
      let foundRecord = superFindRecord.apply(this, arguments);
      if (!snapshot.adapterOptions || !snapshot.adapterOptions.projectionName) {
        return foundRecord;
      }
      return foundRecord.then((payload) => {
        // TODO Scan all inputs
        let id = payload.data.id;
        payload.data.projectionTypes.forEach((typeName) => {
          let cacheKey = `${typeName}:${id}`;
          projectionCache[cacheKey] = true;
        });
        return payload;
      });
    }
  },

  afterEach() {
    this.sinon.restore();
  },

  store: function() {
    return this.container.lookup('service:store');
  },

  adapter: function() {
    return this.store().adapterFor('application');
  },
});

test('findRecord will issue a request for a projection, if it hasn\'t been fetched', function(assert) {
  assert.expect(4);

  let ajaxSpy = this.sinon.stub(this.adapter(), 'ajax').returns(Promise.resolve(initialPayload));

  let store = this.store();
  run(() => {
    store.findRecord(PersonTypeName, '1');
  });

  ajaxSpy.reset();
  ajaxSpy.returns(Promise.resolve(overrideType(initialPayload, CompactPersonTypeName)));

  run(() => {
    store.findRecord(CompactPersonTypeName, '1')
      .then((record) => {
        assert.equal(get(record, 'description'), null);
        assert.equal(get(record, 'name'), 'Tom Dale');
        assert.ok(ajaxSpy.calledOnce);
      });
  });

  run(() => {
    store.findRecord(CompactPersonTypeName, '1')
      .then(() => {
        // Second request for the same projection should correctly be cached
        assert.ok(ajaxSpy.calledOnce);
      });
  });
});

test('peekRecord will not return a projection, if it hasn\'t been fetched', function(assert) {
  assert.expect(1);
  
  this.sinon.stub(this.adapter(), 'ajax').returns(Promise.resolve(initialPayload));

  let store = this.store();
  run(() => {
    store.findRecord(PersonTypeName, '1');
  });

  let compactPerson = store.peekRecord(CompactPersonTypeName, '1');

  assert.equal(compactPerson, null);
});

test('findRecord will update existing projetions', function(assert) {
  assert.expect(6);

  let compactPersonNotified = false;

  let ajaxSpy = this.sinon.stub(this.adapter(), 'ajax').returns(Promise.resolve(overrideType(initialPayload, CompactPersonTypeName)));

  let store = this.store();
  run(() => {
    store.findRecord(CompactPersonTypeName, '1');
  });

  let compactPerson = store.peekRecord(CompactPersonTypeName, '1');

  addObserver(compactPerson, 'name', () => {
    compactPersonNotified = true;
  });

  ajaxSpy.reset();
  ajaxSpy.returns(Promise.resolve(updatePayload));

  run(() => {
    store.findRecord(PersonTypeName, '1');
  });

  let person = store.peekRecord(PersonTypeName, '1');

  assert.notEqual(person, null);
  assert.equal(get(person, 'name'), 'Yehuda Katz');
  assert.equal(get(person, 'description'), 'Tilde Co-Founder, OSS enthusiast and world traveler.');

  assert.equal(compactPersonNotified, true);
  assert.equal(get(compactPerson, 'name'), 'Yehuda Katz');
  assert.equal(get(compactPerson, 'description'), null);
});

test('set will update existing projections', function(assert) {
  assert.expect(0)
});

test('clients cannot access not white-listed properties in nested models', function(assert) {
  assert.expect(2);

  this.sinon.stub(this.adapter(), 'ajax').returns(Promise.resolve(overrideType(initialPayload, CompactPersonTypeName)));

  let store = this.store();
  run(() => {
    store.findRecord(CompactPersonTypeName, '1');
  });

  let compactPerson = store.peekRecord(CompactPersonTypeName, '1');

  assert.equal(get(compactPerson, 'address.country'), 'US');
  assert.equal(get(compactPerson, 'address.street'), null);
});

