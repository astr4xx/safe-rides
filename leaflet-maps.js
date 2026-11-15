/* leaflet-maps.js
   Replaces the Google Maps parts of Safe Rides with free OpenStreetMap + Leaflet.
   No API key, no billing. Must load AFTER the main inline <script> in index.html. */
(function () {
  'use strict';

  var BENGALURU = [12.9716, 77.5946];

  function setText(id, text) {
    var node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  if (!window.L) {
    console.warn('Leaflet failed to load; maps are disabled.');
    setText('distanceStatus', 'The map could not load. Check your internet connection and refresh.');
    setText('providerMapStatus', 'The map could not load. Check your internet connection and refresh.');
    return;
  }

  var style = document.createElement('style');
  style.textContent =
    '#customerMap,#providerMap{position:relative;z-index:0;isolation:isolate;background:#111a29}' +
    '.leaflet-container{font:inherit}' +
    '.leaflet-popup-content{font-size:13px;line-height:1.5;color:#1b2230}' +
    '.leaflet-popup-content a{color:#2b6be0;text-decoration:underline}' +
    '.map-search-row{display:flex;gap:8px}' +
    '.map-search-row .form-input{flex:1;min-width:0}';
  document.head.appendChild(style);

  function makeMap(element) {
    var map = L.map(element, { center: BENGALURU, zoom: 12 });
    var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    });
    var esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    });
    var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      subdomains: 'abc',
      attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; OpenTopoMap (CC-BY-SA)'
    });
    osm.addTo(map);
    L.control.layers({ 'Street (OpenStreetMap)': osm, 'Street (Esri)': esri, 'Terrain (OpenTopoMap)': topo }, null, { position: 'topright' }).addTo(map);
    return map;
  }

  async function geocode(query) {
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=' + encodeURIComponent(query);
    var response = await fetch(url);
    if (!response.ok) throw new Error('Search failed');
    var results = await response.json();
    if (!results.length) return null;
    return { lat: Number(results[0].lat), lng: Number(results[0].lon), label: results[0].display_name };
  }

  window.addPlaceSearch = function (containerId, onPlace) {
    var box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    var statusId = containerId === 'customerAutocomplete' ? 'distanceStatus' : 'providerMapStatus';

    var row = document.createElement('div');
    row.className = 'map-search-row';
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'form-input';
    input.placeholder = 'Search pickup area, address, or landmark';
    input.setAttribute('aria-label', 'Search for a place');
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = 'Search';
    row.appendChild(input);
    row.appendChild(button);
    box.appendChild(row);

    async function run() {
      var query = input.value.trim();
      if (!query) return;
      button.disabled = true;
      setText(statusId, 'Searching...');
      try {
        var place = await geocode(query);
        if (!place) {
          setText(statusId, 'No place found. Try a more specific search or click the map.');
        } else {
          onPlace(place);
        }
      } catch (error) {
        console.warn('Place search failed:', error);
        setText(statusId, 'Place search is unavailable right now. Click the map instead.');
      } finally {
        button.disabled = false;
      }
    }

    button.addEventListener('click', run);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        run();
      }
    });
  };

  window.renderVehicleMarkers = function (vehicles) {
    if (!customerMap) return;
    vehicleMarkers.forEach(function (marker) { marker.remove(); });
    vehicleMarkers = [];
    vehicles.filter(hasVehicleCoordinates).forEach(function (vehicle) {
      var lat = Number(vehicle.latitude);
      var lng = Number(vehicle.longitude);
      var marker = L.marker([lat, lng], { title: vehicle.name }).addTo(customerMap);
      var distance = customerOrigin && Number.isFinite(distanceKmTo(vehicle))
        ? '<br>' + formatDistance(distanceKmTo(vehicle)) + ' away' : '';
      marker.bindPopup(
        '<strong>' + escapeHtml(vehicle.name) + '</strong><br>' +
        escapeHtml(vehicle.pickupPoint || vehicle.city || 'Pickup point') + distance +
        '<br><a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lng) +
        '" target="_blank" rel="noopener noreferrer">Open in Maps</a>'
      );
      vehicleMarkers.push(marker);
    });
  };

  window.setCustomerOrigin = function (latitude, longitude, label, centerMap) {
    customerOrigin = { latitude: Number(latitude), longitude: Number(longitude), label: label };
    if (customerMap) {
      if (customerOriginMarker) customerOriginMarker.remove();
      customerOriginMarker = L.circleMarker([customerOrigin.latitude, customerOrigin.longitude], {
        radius: 9, color: '#ffffff', weight: 2, fillColor: '#4387ff', fillOpacity: 1
      }).addTo(customerMap).bindTooltip('Your ' + label);
      if (centerMap) customerMap.setView([customerOrigin.latitude, customerOrigin.longitude], 15);
    }
    setText('distanceStatus', 'Rentals are sorted by distance from your ' + label + '. This search point is not saved to your account.');
    renderCars();
  };

  window.initializeCustomerMap = function () {
    if (customerMap) return;
    var element = document.getElementById('customerMap');
    if (!element) return;
    customerMap = makeMap(element);
    customerMap.on('click', function (event) {
      setCustomerOrigin(event.latlng.lat, event.latlng.lng, 'selected map point', false);
    });
    addPlaceSearch('customerAutocomplete', function (place) {
      setCustomerOrigin(place.lat, place.lng, place.label || 'selected place', true);
    });
  };

  window.selectProviderLocation = function (latitude, longitude, centerMap) {
    var lat = Number(latitude);
    var lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    document.getElementById('vehicleLatitude').value = lat.toFixed(5);
    document.getElementById('vehicleLongitude').value = lng.toFixed(5);
    if (providerMap) {
      if (providerMapMarker) {
        providerMapMarker.setLatLng([lat, lng]);
      } else {
        providerMapMarker = L.marker([lat, lng], { title: 'Vehicle pickup point' }).addTo(providerMap);
      }
      if (centerMap) providerMap.setView([lat, lng], 16);
    }
    setText('providerMapStatus', 'Pickup pin selected at ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '. These coordinates will be public with the listing.');
  };

  window.initializeProviderMap = function () {
    var element = document.getElementById('providerMap');
    if (!element) return;
    if (providerMap) { providerMap.invalidateSize(); return; }
    providerMap = makeMap(element);
    providerMap.on('click', function (event) {
      selectProviderLocation(event.latlng.lat, event.latlng.lng, false);
    });
    addPlaceSearch('providerAutocomplete', function (place) {
      var pickupInput = document.getElementById('vehiclePickupPoint');
      if (pickupInput) pickupInput.value = place.label || '';
      selectProviderLocation(place.lat, place.lng, true);
    });
    window.setTimeout(function () { if (providerMap) providerMap.invalidateSize(); }, 250);
  };

  setText('distanceStatus', 'Search for a place, use your current location, or click the map to sort rentals by distance.');
  setText('providerMapStatus', 'Click the map to place a required pickup pin.');
  initializeCustomerMap();
  renderCars();
  var portal = document.getElementById('providerPortal');
  if (currentAccountRole === 'provider' && portal && portal.style.display !== 'none') {
    initializeProviderMap();
  }
})();