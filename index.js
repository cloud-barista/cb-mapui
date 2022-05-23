/*
Copyright 2019 The Cloud-Barista Authors.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

----
Copyright for OpenLayers (https://openlayers.org/)

BSD 2-Clause License

Copyright 2005-present, OpenLayers Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
----
*/

import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import { MultiPoint, Point } from 'ol/geom';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { getVectorContext } from 'ol/render';
import { LineString, Polygon } from 'ol/geom';
import { Vector as VectorLayer } from 'ol/layer';
import Feature from 'ol/Feature';
import { TileJSON, Vector as VectorSource } from 'ol/source';
import { Icon } from 'ol/style';
import { useGeographic } from 'ol/proj';

// popup overlay
import Overlay from 'ol/Overlay';
import {toLonLat} from 'ol/proj';
import {toStringHDMS} from 'ol/coordinate';

// mouse postion
import MousePosition from 'ol/control/MousePosition';
import {createStringXY} from 'ol/coordinate';
import {defaults as defaultControls} from 'ol/control';

// ES6 Modules or TypeScript
import Swal from 'sweetalert2'
const Swal = require('sweetalert2')

const axios = require('axios')

//var express = require('express');
//var app = express();
//var publicDir = require('path').join(__dirname,'/public');
//app.use(express.static(publicDir));

useGeographic();
var i, j;
var cnti, cntj;

//var namespace = ''

//var geoServiceKey = '';
var geoServiceKey = 'your key';


const cntInit = 0;
var cnt = cntInit;

//var n = 1000;
var geometries = new Array();
var geometriesPoints = new Array();
var mcisName = new Array();
var mcisStatus = new Array();
var mcisGeo = new Array();

var ipMap = [];
var geoMap = [];

var messageTextArea = document.getElementById("message");
var messageDetailTextArea = document.getElementById("message2");
var cspListDisplayEnabled = document.getElementById("displayOn");
var tableDisplayEnabled = document.getElementById("tableOn");
var table = document.getElementById('detailTable');
var recommendPolicy = document.getElementById('recommendPolicy');
var selectApp = document.getElementById('selectApp');
var newline = String.fromCharCode(13, 10); // newline is special Char used in TextArea box
var hostnameElement = document.getElementById("hostname");
var portElement = document.getElementById("port");

//for (i = 0; i < n; ++i) {
//  mcisGeo[i] = new Array();
//}



var tileLayer = new TileLayer({
  source: new OSM()
});

/*
 * Create the map.
 */
var map = new Map({
  layers: [tileLayer],
  target: 'map',
  view: new View({
    center: [0, 0],
    zoom: 2
  }),
  //projection: 'EPSG:4326'
});

// fucntion for clear map.
function clearMap() {
  table.innerHTML = "";
  messageDetailTextArea.value = '';
  messageTextArea.value = '';
  geometries = [];
  map.render();
}
window.clearMap = clearMap;

function clearCircle(option) {
  //document.getElementById("latLonInputPairArea").innerHTML = '';
  if (option == "clearText"){
    messageTextArea.value = '';
  }
  latLonInputPairIdx = 0;
  recommendedSpecList = [];
  cspPointsCircle = [];
  geoCspPointsCircle = [];
  messageDetailTextArea.value = '';
  table.innerHTML = "";
}
window.clearCircle = clearCircle;

function writeLatLonInputPair(idx, lat, lon) {
  var recommendedSpec = getRecommendedSpec(idx, lat, lon);
  var latf = lat.toFixed(4);
  var lonf = lon.toFixed(4);

  //document.getElementById("latLonInputPairArea").innerHTML += 
  `VM ${idx+1}: (${latf}, ${lonf}) / `
  if (idx == 0) {
    messageTextArea.value = `[Started MCIS configuration]\n`
  }
  messageTextArea.value += `\n - [VM-${idx+1}]  Location:  ${latf}, ${lonf}\t\t| Best Spec: `
  messageTextArea.scrollTop = messageTextArea.scrollHeight;
}

var latLonInputPairIdx = 0;
var recommendedSpecList = new Array();

map.on('singleclick', function (event) {
  const coord = event.coordinate;
  // document.getElementById('latitude').value = coord[1];
  // document.getElementById('longitude').value = coord[0];

  writeLatLonInputPair(latLonInputPairIdx, coord[1], coord[0])
  latLonInputPairIdx++;
});

// Display Icon for Cloud locations
// npm i -s csv-parser
const http = require("http");
const csv = require("csv-parser");

const csvPath = "https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/master/assets/cloudlocation.csv";
const cloudLocation = [];
var cspPointsAzure = [];
var cspPointsAws = [];
var cspPointsGcp = [];
var cspPointsAlibaba = [];
var cspPointsCloudit = [];
var cspPointsIBM = [];
var cspPointsTencent = [];
var cspPointsCircle = [];
var geoCspPointsAzure = new Array();
var geoCspPointsAws = new Array();
var geoCspPointsGcp = new Array();
var geoCspPointsAlibaba = new Array();
var geoCspPointsCloudit = new Array();
var geoCspPointsIBM = new Array();
var geoCspPointsTencent = new Array();
var geoCspPointsCircle = new Array();

function displayCSPListOn() {

  if (cspListDisplayEnabled.checked){
    http.get(csvPath,
      (response) => {
        response
          .pipe(csv())
          .on("data", (chunk) => cloudLocation.push(chunk))
          .on("end", () => {
            console.log(cloudLocation);

            messageTextArea.value = "[Complete] Display Known Cloud Regions: " + cloudLocation.length + "\n";

            for (var i = 0; i < cloudLocation.length; ++i) {
              // title: CloudType, ID,        DisplayName, Latitude, Longitude
              // ex:    azure,     eastasia,  East Asia,   22.2670,  114.1880
              console.log(cloudLocation[i]["CloudType"])
              if (cloudLocation[i]["CloudType"] == "azure") {
                cspPointsAzure.push([cloudLocation[i]["Longitude"], cloudLocation[i]["Latitude"]]);
              }
              if (cloudLocation[i]["CloudType"] == "aws") {
                cspPointsAws.push([cloudLocation[i]["Longitude"], cloudLocation[i]["Latitude"]]);
              }
              if (cloudLocation[i]["CloudType"] == "gcp") {
                cspPointsGcp.push([cloudLocation[i]["Longitude"], cloudLocation[i]["Latitude"]]);
              }
              if (cloudLocation[i]["CloudType"] == "alibaba") {
                cspPointsAlibaba.push([cloudLocation[i]["Longitude"], cloudLocation[i]["Latitude"]]);
              }
              if (cloudLocation[i]["CloudType"] == "cloudit") {
                cspPointsCloudit.push([cloudLocation[i]["Longitude"], cloudLocation[i]["Latitude"]]);
              }
              if (cloudLocation[i]["CloudType"] == "ibm") {
                cspPointsIBM.push([cloudLocation[i]["Longitude"], cloudLocation[i]["Latitude"]]);
              }
              if (cloudLocation[i]["CloudType"] == "tencent") {
                cspPointsTencent.push([cloudLocation[i]["Longitude"], cloudLocation[i]["Latitude"]]);
              }
            }
            
          });
      }
    );  
  } else {
    cspPointsAzure = [];
    cspPointsAws = [];
    cspPointsGcp = [];
    cspPointsAlibaba = [];
    cspPointsCloudit = [];
    cspPointsIBM = [];
    cspPointsTencent = [];
  }
  geoCspPointsAzure[0] = new MultiPoint([cspPointsAzure]);
  geoCspPointsAws[0] = new MultiPoint([cspPointsAws]);
  geoCspPointsGcp[0] = new MultiPoint([cspPointsGcp]);
  geoCspPointsAlibaba[0] = new MultiPoint([cspPointsAlibaba]);
  geoCspPointsCloudit[0] = new MultiPoint([cspPointsCloudit]);
  geoCspPointsIBM[0] = new MultiPoint([cspPointsIBM]);
  geoCspPointsTencent[0] = new MultiPoint([cspPointsTencent]);
}
window.displayCSPListOn = displayCSPListOn;

function displayTableOn() {
  table.innerHTML = "";
}
window.displayTableOn = displayTableOn;

function endpointChanged() {
  //getMcis();
}
window.endpointChanged = endpointChanged;


var mcisGeo2 = [];
//mcisGeo2.push([-180, -90]);



for (var i = 0; i < cntInit; ++i) {
  var lon = 300 * Math.random() - 180;
  var lat = 100 * Math.random() - 90;

  var testPoints = [];

  lon = -60;
  lat = -60;

  if(i==0){
    /*
    testPoints.push([127,37]);
    testPoints.push([127.4, 36.4]);
    testPoints.push([126.7, 34.7]);
    testPoints.push([129, 35.1]);
    testPoints.push([128.9, 37.9]);
*/

    testPoints.push([-42,-19]);
    testPoints.push([-44, -11]);
    testPoints.push([27, -29]);
    testPoints.push([29, -25]);
    mcisName[i] = "[M1] " + "Running-(4/4)"
    mcisStatus[i] = "Running-(4/4)"
    
  }
  if(i==1){
    testPoints.push([-121,45]);
    testPoints.push([-100, 46]);
    testPoints.push([-80, 35]);
    testPoints.push([-117, 34]);
    mcisName[i] = "[M2] " + "Running-(4/4)"
    mcisStatus[i] = "Running-(4/4)"
  }
  if(i==2){
    testPoints.push([2, 49]);
    testPoints.push([14, 52]);
    testPoints.push([22, 51]);
    testPoints.push([23, 48]);
    testPoints.push([13, 46]);
    testPoints.push([7, 45]);
    mcisName[i] = "[M3] " + "Running-(6/6)"
    mcisStatus[i] = "Running-(6/6)"
  }
  
  //testPoints.push([lon, lat] );

  //console.log("testPoints : " + testPoints);

  //geometries[i] = new Polygon([[[lon, lat], [lon+5, lat+5], [lon-5, lat-5], [lon, lat]]]);
  //geometriesPoints[i] = new MultiPoint([[[lon, lat], [lon+5, lat+5], [lon-5, lat-5], [lon, lat]]]);
  
  mcisGeo[i] = new Polygon([[[lon, lat], [lon + 5, lat + 5], [lon - 5, lat - 5], [lon, lat]]]);
  geometriesPoints[i] = new MultiPoint([testPoints]);


  testPoints = convexHull(testPoints);
  testPoints.push(testPoints[0]);
  geometries[i] = new Polygon([testPoints]);

}

//initDemoPoly();

function initDemoPoly(){
  var testPoints = [];
  
  testPoints.push([127,37]);
  testPoints.push([127.1, 36]);
  testPoints.push([126.7, 34]);
  testPoints.push([129, 35.1]);
  testPoints.push([128, 37]);

  mcisName[cnt] = "[Test] " + "Running-(6/6)"
  mcisStatus[cnt] = "Running-(6/6)"
  geometriesPoints[cnt] = new MultiPoint([testPoints]);

  testPoints = convexHull(testPoints);
  testPoints.push(testPoints[0]);
  geometries[cnt] = new Polygon([testPoints]);

  cnt++;

}

var imgPath = 'https://openlayers.org/en/v3.20.1/examples/data/icon.png'
//var imgPath = './img/icon2.png'



var ipList = [
  "1.0.4.0",
  "1.0.16.0",
  "1.11.0.0",
  //"52.9.154.255",
  //"72.14.192.0",
  //"74.125.0.0",
  //"81.169.181.179",
  "216.239.32.0",
  "27.116.56.0",
  "79.133.0.0",
  "41.74.0.0",
  "1.6.0.0",
  "41.73.96.0",
  "1.37.0.0",
  "2.23.224.0"
];



var ipTmpList = [
  "54.153.187.176",
  "3.106.158.182",
  "3.24.244.117",
  "54.66.205.122",
  "13.238.135.53"
];

var geoTmpCnt = 0;
var geoTmpList = [
  [-80, 50],    //a-central-1    캐나다(중부) Montreal
  [-119, 37],   //us-west-1    미국 서부(캘리포니아 북부 지역) 
  [-81, 35],    //us-east-1    미국 동부(버지니아 북부) 
  [127, 37.5],  //ap-northeast-2 아시아 태평양(서울)
  [73.5, 19],   //ap-south-1 아시아 태평양(뭄바이)
  [103.5, 2],   //ap-southeast-1 아시아 태평양(싱가포르)
  [140, 36],    //ap-northeast-1 아시아 태평양(도쿄)
  [114.2, 22.2],//East Asia (location: Hong Kong)
  [113, -32],   //호주 서부
  [151, -33.7], //ap-southeast-2 아시아 태평양(시드니)
  [0, 51.5]     //런던
];

var alpha = 0.3;
var cororList = [
  [153, 255, 51, alpha],
  [210, 210, 10, alpha],
  [0, 176, 244, alpha],
  [200, 10, 10, alpha],
  [0, 162, 194, alpha],
  [38, 63, 143, alpha],
  [58, 58, 58, alpha],
  [81, 45, 23, alpha],
  [225, 136, 65, alpha],
  [106, 34, 134, alpha],
  [255, 162, 191, alpha],
  [239, 45, 53, alpha],
  [255, 255, 255, alpha],
  [154, 135, 199, alpha]
];

alpha = 0.6;
var cororLineList = [
  [0, 255, 0, alpha],
  [210, 210, 10, alpha],
  [0, 176, 244, alpha],
  [200, 10, 10, alpha],
  [0, 162, 194, alpha],
  [38, 63, 143, alpha],
  [58, 58, 58, alpha],
  [81, 45, 23, alpha],
  [225, 136, 65, alpha],
  [106, 34, 134, alpha],
  [255, 162, 191, alpha],
  [239, 45, 53, alpha],
  [255, 255, 255, alpha],
  [154, 135, 199, alpha]
];


var polygonFeature = new Feature(
  new Polygon([[[10, -3], [-5, 2], [-1, 1]]])
);

function createStyle(src) {
  return new Style({
    image: new Icon(({
      anchor: [0.5, 0.5],
      crossOrigin: 'anonymous',
      src: src,
      imgSize: [50, 50],
      scale: 0.1
    }))
  });
}

var pnt = new Point([-68, -50]);

import Vector from 'ol/source/Vector.js';
var vectorSource = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature = new Feature(pnt);
iconFeature.set('style', createStyle('img/icon.png'));
iconFeature.set('index', '001');
vectorSource.addFeature(iconFeature);
var iconLayer = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource
})

var iconStyle03 = new Style({
  image: new Icon(({
    //anchor: [0.5, 0.5],
    crossOrigin: 'anonymous',
    src: 'img/icon.png',
    opacity: 1.0,
    //anchor: [0.5, 46],
    //anchorXUnits: 'fraction',
    //anchorYUnits: 'pixels',
    scale: 0.7
  }))
});

// var iconStyle01 = new Style({
//   image: new Icon(({
//     //anchor: [0.5, 0.5],
//     crossOrigin: 'anonymous',
//     src: 'img/icon2.png',
//     opacity: 0.60,
//     imgSize: [50, 50]
//   }))
// });

// var iconStyle02 = new Style({
//   image: new Icon(({
//     anchor: [0.5, 46],
//     anchorXUnits: 'fraction',
//     anchorYUnits: 'pixels',
//     opacity: 0.95,
//     src: 'img/icon2.png'
//   }))
// });

// CSP location Circle icon style
// pnt = new Point([-48, -50]);

var vectorSource1 = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature1 = new Feature(pnt);
iconFeature1.set('style', createStyle('img/circle.png'));
iconFeature1.set('index', '001');
vectorSource1.addFeature(iconFeature1);
var iconLayer1 = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource1
})


var iconStyleCircle = new Style({
  image: new Icon(({
    crossOrigin: 'anonymous',
    src: 'img/circle.png',
    opacity: 1.0,

    anchor: [0.4, 0.4],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
    scale: 1.5
    //imgSize: [50, 50]
  }))
});

// CSP location icon styles

var vectorSource2 = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature2 = new Feature(pnt);
iconFeature2.set('style', createStyle('img/ht-azure.png'));
iconFeature2.set('index', '001');
vectorSource2.addFeature(iconFeature2);
var iconLayer2 = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource2
})

var iconStyleAzure = new Style({
  image: new Icon(({
    //anchor: [0.5, 0.5],
    crossOrigin: 'anonymous',
    src: 'img/ht-azure.png',
    opacity: 1.0,
    //anchor: [0.5, 46],
    //anchorXUnits: 'fraction',
    //anchorYUnits: 'pixels',
    scale: 1.0
  }))
});

var vectorSource3 = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature3 = new Feature(pnt);
iconFeature3.set('style', createStyle('img/ht-aws.png'));
iconFeature3.set('index', '001');
vectorSource3.addFeature(iconFeature3);
var iconLayer3 = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource3
})

var iconStyleAws = new Style({
  image: new Icon(({
    crossOrigin: 'anonymous',
    src: 'img/ht-aws.png',
    opacity: 1.0,
    scale: 1.0
  }))
});

var vectorSource4 = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature4 = new Feature(pnt);
iconFeature4.set('style', createStyle('img/ht-gcp.png'));
iconFeature4.set('index', '001');
vectorSource4.addFeature(iconFeature4);
var iconLayer4 = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource4
})

var iconStyleGcp = new Style({
  image: new Icon(({
    crossOrigin: 'anonymous',
    src: 'img/ht-gcp.png',
    opacity: 1.0,
    scale: 1.0
  }))
});

var vectorSource5 = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature5 = new Feature(pnt);
iconFeature5.set('style', createStyle('img/ht-alibaba.png'));
iconFeature5.set('index', '001');
vectorSource5.addFeature(iconFeature5);
var iconLayer5 = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource5
})

var iconStyleAlibaba = new Style({
  image: new Icon(({
    crossOrigin: 'anonymous',
    src: 'img/ht-alibaba.png',
    opacity: 1.0,
    scale: 1.0
  }))
});

var vectorSource6 = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature6 = new Feature(pnt);
iconFeature6.set('style', createStyle('img/ht-cloudit.png'));
iconFeature6.set('index', '001');
vectorSource6.addFeature(iconFeature6);
var iconLayer6 = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource6
})

var iconStyleCloudit = new Style({
  image: new Icon(({
    crossOrigin: 'anonymous',
    src: 'img/ht-cloudit.png',
    opacity: 1.0,
    scale: 1.0
  }))
});

var vectorSource7 = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature7 = new Feature(pnt);
iconFeature7.set('style', createStyle('img/ibm.png'));
iconFeature7.set('index', '001');
vectorSource7.addFeature(iconFeature7);
var iconLayer7 = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource7
})

var iconStyleIBM = new Style({
  image: new Icon(({
    crossOrigin: 'anonymous',
    src: 'img/ibm.png',
    opacity: 1.0,
    scale: 1.0
  }))
});


var vectorSource8 = new Vector({ projection: 'EPSG:4326' }); //새로운 벡터 생성
var iconFeature8 = new Feature(pnt);
iconFeature8.set('style', createStyle('img/tencent.png'));
iconFeature8.set('index', '001');
vectorSource8.addFeature(iconFeature8);
var iconLayer8 = new VectorLayer({
  style: function (feature) {
    return feature.get('style');
  },
  source: vectorSource8
})

var iconStyleTencent = new Style({
  image: new Icon(({
    crossOrigin: 'anonymous',
    src: 'img/tencent.png',
    opacity: 1.0,
    scale: 1.0
  }))
});



// Icon layers
map.addLayer(iconLayer1);
map.addLayer(iconLayer2);
map.addLayer(iconLayer3);
map.addLayer(iconLayer4);
map.addLayer(iconLayer5);
map.addLayer(iconLayer6);
map.addLayer(iconLayer7);
map.addLayer(iconLayer8);
map.addLayer(iconLayer);



var imageStyle = new Style({
  image: new CircleStyle({
    radius: 2,
    fill: new Fill({ color: 'red' }),
    //stroke: new Stroke({color: 'red', width: 1})
  })
});


var lineStyle = new Style({
  stroke: new Stroke({
    width: 5,
    color: [255, 0, 0, 1]
  })
});

var headInnerImageStyle = new Style({
  image: new CircleStyle({
    radius: 1,
    fill: new Fill({ color: 'blue' })
  })
});

var headOuterImageStyle = new Style({
  image: new CircleStyle({
    radius: 1,
    fill: new Fill({ color: 'black' })
  })
});




// magenta black blue orange yellow red grey green
function changeColorStatus(status){
  if (status.includes("Partial")){
    return 'green';
  } else if (status.includes("Running")){
    return 'blue';
  } else if (status.includes("Suspending")){
    return 'black';
  } else if (status.includes("Creating")){
    return 'orange';
  } else if (status.includes("Terminated")){
    return 'red';
  } else {
    return 'grey';
  }
}

function changeSizeStatus(status){
  if (status.includes("-df")){
    return 0.4;
  } else if (status.includes("-ws")){
    return 0.4;
  } else if (status.includes("Partial")){
    return 2.4;
  } else if (status.includes("Running")){
    return 2.8;
  } else if (status.includes("Suspending")){
    return 2.4;
  } else if (status.includes("Suspended")){
    return 2.4;
  } else if (status.includes("Creating")){
    return 2.8;
  } else if (status.includes("Resuming")){
    return 2.4;
  } else if (status.includes("Terminated")){
    return 2.4;
  } else {
    return 1.0;
  }
}

function changeSizeByName(status){
  if (status.includes("-best")){
    return 3.5;
  } else if (status.includes("-df")){
    return 0.4;
  } else if (status.includes("-ws")){
    return 0.4;
  } else {
    return 2.8;
  }
}

function returnAdjustmentPoint(num){
  ax = 0.0;
  ay = 0.0;
  if (num == 1){
    ax = 0;
    ay = 1;
  } else if (num == 2){
    ax = 0.8;
    ay = 0.8;
  } else if (num == 3){
    ax = 1;
    ay = 0;
  } else if (num == 4){
    ax = 0.8;
    ay = -0.8;
  } else if (num == 5){
    ax = 0;
    ay = -1;
  } else if (num == 6){
    ax = -0.8;
    ay = -0.8;
  } else if (num == 7){
    ax = -1;
    ay = -0;
  } else if (num == 8){
    ax = -0.8;
    ay = 0.8;
  }else {
    ax=Math.random() - Math.random();
    ay=Math.random() - Math.random();
  }
  ax=Math.random()*0.1+ax
  ay=Math.random()*0.1+ay
  ay=ay*0.78

  return { ax, ay }
}

var n = 400;
var omegaTheta = 600000; // Rotation period in ms
var R = 7;
var r = 2;
var p = 2;

var coordinates = [];
coordinates.push([-180, -90]);

var coordinatesFromX = [];
coordinatesFromX.push([0]);
var coordinatesFromY = [];
coordinatesFromY.push([0]);

var coordinatesToX = [];
coordinatesToX.push([1]);
var coordinatesToY = [];
coordinatesToY.push([1]);


function makeTria(ip1, ip2, ip3) {
  changePoints(ip1, ip2);
  changePoints(ip2, ip3);
  changePoints(ip3, ip1);

  geometries[cnt] = new Polygon([[ip1, ip2, ip3, ip1]]);
  //cnt++;
}

/*
//Example: Make poly using arguments object.
function makePoly(){

  for(i = 0; i < arguments.length; i++) {
    coordinates.push(arguments[i]); 
  }

  var resourcePoints = [];

  for(i = 0; i < arguments.length; i++) {
    resourcePoints.push(arguments[i]); 
  }
  geometriesPoints[cnt] = new MultiPoint(resourcePoints);

  resourcePoints.push(arguments[0]); 

  geometries[cnt] = new Polygon([resourcePoints]);

  mcisGeo[cnt] = new Polygon([resourcePoints]);
  //cnt++;
}
*/

function makePolyDot(vmPoints) {

  //for (i = 0; i < vmPoints.length; i++) {
    //coordinates.push(vmPoints[i]);
  //}

  var resourcePoints = [];

  for (i = 0; i < vmPoints.length; i++) {
    resourcePoints.push(vmPoints[i]);
  }

  geometriesPoints[cnt] = new MultiPoint(resourcePoints);

  //cnt++;
}

function makePolyArray(vmPoints) {

  //for (i = 0; i < vmPoints.length; i++) {
    //coordinates.push(vmPoints[i]);
  //}

  var resourcePoints = [];

  for (i = 0; i < vmPoints.length; i++) {
    resourcePoints.push(vmPoints[i]);
  }

  //geometriesPoints[cnt] = new MultiPoint(resourcePoints);

  resourcePoints.push(vmPoints[0]);

  geometries[cnt] = new Polygon([resourcePoints]);

  mcisGeo[cnt] = new Polygon([resourcePoints]);
  //cnt++;
}


function cross(a, b, o) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/**
* @param points An array of [X, Y] coordinates
*/
function convexHull(points) {
  points.sort(function (a, b) {
    return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
  });

  var lower = [];
  for (var i = 0; i < points.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
      lower.pop();
    }
    lower.push(points[i]);
  }

  var upper = [];
  for (var i = points.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
      upper.pop();
    }
    upper.push(points[i]);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}


function changePoints(ipFrom, ipTo) {
  var lon = 360 * Math.random() - 180;
  var lat = 180 * Math.random() - 90;

  var lon1 = 360 * Math.random() - 180;
  var lat1 = 180 * Math.random() - 90;


  //coordinates.push([x, y]);
  //coordinates.push([lon, lat]);  
  console.log(ipFrom);
  console.log(ipTo);

  coordinates.push(ipFrom);
  coordinates.push(ipTo);
  //coordinates.push([lon1, lat1]);
  /*
      coordinatesFromX.push([lon]);
      coordinatesFromY.push([lat]);
      coordinatesToX.push([lon]);
      coordinatesToY.push([lat]);
  */

  var i, j;

  var xFrom = ipFrom[0]
  var yFrom = ipFrom[1]
  var xTo = ipTo[0]
  var yTo = ipTo[1]
  for (j = 1; j < n; ++j) {

    var goX = xFrom + j * (xTo - xFrom) / n
    var goY = (yTo - yFrom) / (xTo - xFrom) * (goX - xFrom) + yFrom
    //coordinates.push([goX, goY]);

    //console.log(goX)
    //console.log(goY)
    //vectorContext.setStyle(headOuterImageStyle);
    //vectorContext.drawGeometry(new Point([goX*100,goY*100]));
  }
  /*
for (i = 0; i < coordinatesFromX.length; ++i) {
  //console.log(coordinatesFrom[i])
  //console.log(coordinatesTo[i])
  //vectorContext.drawGeometry(new LineString([coordinatesFrom[i], coordinatesTo[i] ]));
  var xFrom = coordinatesFromX[i]
  var yFrom = coordinatesFromY[i]
  var xTo = coordinatesToX[i]
  var yTo = coordinatesToY[i]
  for (j=1; j < n; ++j){
 
    var goX = xFrom + (xTo - xFrom)/j
    var goY = (yTo - yFrom)/(xTo - xFrom)*(goX-xFrom)+yFrom
    //console.log(goX)
    //console.log(goY)
    vectorContext.setStyle(headOuterImageStyle);
    vectorContext.drawGeometry(new Point([goX*100,goY*100]));
  }
}
*/

}


var refreshInterval = 5;
setTimeout(() => console.log(getMcis()), refreshInterval*1000);
//setTimeout(() => console.log(getConnection()), refreshInterval*1000);


function infoAlert(message) {
  Swal.fire({
    // position: 'top-end',
    icon: 'info',
    title: message,
    showConfirmButton: false,
    timer: 2500
  })
}

function errorAlert(message) {
  Swal.fire({
    // position: 'bottom-start',
    icon: 'error',
    title: message,
    showConfirmButton: false,
    //timer: 2000
  })
}


function getMcis() {
  
  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var namespace = document.getElementById("namespace").value;

  refreshInterval = document.getElementById("refreshInterval").value;
  var filteredRefreshInterval = isNormalInteger(refreshInterval) ? refreshInterval : 5;
  setTimeout(() => console.log(getMcis()), filteredRefreshInterval*1000);
  
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis?option=status`

  axios({
    method: 'get',
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`
    },
    timeout: 9000
  })
  .then((res)=>{
      document.getElementById("hostname").style.color = "#000000";
      document.getElementById("port").style.color = "#000000";

      console.log("[Get MCIS list from CB-Tumblebug API]");

      var obj = res.data;

      var zoomLevel = map.getView().getZoom() * 2.0
      var radius = 4.0

      cnt = cntInit;
      if ( obj.mcis != null ){
        console.log(obj.mcis);
      for (let item of obj.mcis) {
        //console.log("Index:[" + "]obj.mcis[i].name = " + item.name);
        console.log(item);

        //mcisGeo[i] = new Array();

        var vmGeo = [];

        var validateNum = 0;
        for (j = 0; j < item.vm.length; j++) {
          //vmGeo.push([(item.vm[j].location.longitude*1) + (Math.round(Math.random()) / zoomLevel - 1) * Math.random()*1, (item.vm[j].location.latitude*1) + (Math.round(Math.random()) / zoomLevel - 1) * Math.random()*1 ])
          if (j == 0){
            vmGeo.push([(item.vm[j].location.longitude*1), (item.vm[j].location.latitude*1) ])
          } else {
            vmGeo.push([(item.vm[j].location.longitude*1) + returnAdjustmentPoint(j).ax/zoomLevel*radius , (item.vm[j].location.latitude*1) + returnAdjustmentPoint(j).ay/zoomLevel*radius ])
          }
          validateNum++;

        }
        if (item.vm.length == 1){
          // handling if there is only one vm so that we can not draw geometry
          vmGeo.pop()
          vmGeo.push([(item.vm[0].location.longitude*1) , (item.vm[0].location.latitude*1) ])
          vmGeo.push([(item.vm[0].location.longitude*1) + Math.random()*0.001, (item.vm[0].location.latitude*1) + Math.random()*0.001 ])
          vmGeo.push([(item.vm[0].location.longitude*1) + Math.random()*0.001, (item.vm[0].location.latitude*1) + Math.random()*0.001 ])
        }
        if (validateNum == item.vm.length) {
          console.log("Found all GEOs validateNum : " + validateNum)

          //make dots without convexHull
          makePolyDot(vmGeo)
          vmGeo = convexHull(vmGeo);

          for (j = 0; j < vmGeo.length; j++) {

            console.log("vmGeo[" + j + "] is" + vmGeo[j]);

          }
          //mcisGeo2.push(vmGeo);
          //makePoly4( vmGeo[0], vmGeo[1],[-95.712891, 37.09024], vmGeo[0]);

          //makePoly5( [-15.712891, 47.09024], [-25.712891, 12.09024], [25.712891, 32.09024],[-25.712891, 31.09024], [-15.712891, 47.09024]);

          mcisStatus[cnt] = item.status  
          //mcisStatus[cnt] = item.targetAction + '-> ' + item.status 
          if (item.targetAction == "None" || item.targetAction == "") {
            mcisName[cnt] = "[" + item.name + "]"
          } else {
            mcisName[cnt] = item.targetAction + '-> '+"[" + item.name + "]"
          }

          console.log("item.status is" + item.status);

          //make poly with convexHull
          makePolyArray(vmGeo);

          cnt++;
        }
      }
    }

  })
  .catch(function (error) {
    
    if (error.request) {
      document.getElementById("hostname").style.color = "#FF0000";
      document.getElementById("port").style.color = "#FF0000";
    }
    console.log(error);
  });

}

// Get list of cloud connections
function getConnection() {


  let timerInterval
  Swal.fire({
    title: 'Show registered Cloud Regions to the Map',
    html: 'closed in <b></b> milliseconds.',
    timer: 2000,
    timerProgressBar: true,
    position: 'top-end',
    didOpen: () => {
      Swal.showLoading()
      const b = Swal.getHtmlContainer().querySelector('b')
      timerInterval = setInterval(() => {
        b.textContent = Swal.getTimerLeft()
      }, 100)
    },
    willClose: () => {
      clearInterval(timerInterval)
    }
  }).then((result) => {
    /* Read more about handling dismissals below */
    if (result.dismiss === Swal.DismissReason.timer) {
      console.log('I was closed by the timer')
    }
  })  
  
  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  refreshInterval = document.getElementById("refreshInterval").value;
  var filteredRefreshInterval = isNormalInteger(refreshInterval) ? refreshInterval : 5;
  //setTimeout(() => console.log(getConnection()), filteredRefreshInterval*1000);
    
  // var http = require('http');
  var mcisOptions = {
    hostname: hostname,
    port: port,
    path: '/tumblebug/connConfig',
    method: 'GET',
    headers: {
      "Authorization" : auth
    }
  };

  function handleResponse(response) {
    var serverData = '';
    response.on('data', function (chunk) {
      serverData += chunk;
    });
    response.on('end', function () {
      console.log("[Get Connection list from CB-Tumblebug API]");
      //console.log(serverData);
      var obj = JSON.parse(serverData);

      if ( obj.connectionconfig != null ){

        messageTextArea.value = "[Complete] Number of Registered Cloud Regions: " + obj.connectionconfig.length + "\n";

            for (var i = 0; i < obj.connectionconfig.length; ++i) {
              // title: CloudType, ID,        DisplayName, Latitude, Longitude
              // ex:    azure,     eastasia,  East Asia,   22.2670,  114.1880
              providerName = obj.connectionconfig[i].ProviderName.toLowerCase()
              longitude = obj.connectionconfig[i].Location.longitude
              latitude = obj.connectionconfig[i].Location.latitude
              briefAddr = obj.connectionconfig[i].Location.briefAddr
              nativeRegion = obj.connectionconfig[i].Location.nativeRegion

              messageTextArea.value += ("["+i+"] "+ obj.connectionconfig[i].ProviderName+"("+nativeRegion+")" + "\t\t\t" + "Location: " +longitude +"|"+ latitude + " ("+briefAddr+")\n");

              if (providerName == "azure") {
                cspPointsAzure.push([longitude, latitude]);
              }
              if (providerName == "aws") {
                cspPointsAws.push([longitude, latitude]);
              }
              if (providerName == "gcp") {
                cspPointsGcp.push([longitude, latitude]);
              }
              if (providerName == "alibaba") {
                cspPointsAlibaba.push([longitude, latitude]);
              }
              if (providerName == "cloudit") {
                cspPointsCloudit.push([longitude, latitude]);
              }
              if (providerName == "ibm") {
                cspPointsIBM.push([longitude, latitude]);
              }
              if (providerName == "tencent") {
                cspPointsTencent.push([longitude, latitude]);
              }
            }

            geoCspPointsAzure[0] = new MultiPoint([cspPointsAzure]);
            geoCspPointsAws[0] = new MultiPoint([cspPointsAws]);
            geoCspPointsGcp[0] = new MultiPoint([cspPointsGcp]);
            geoCspPointsAlibaba[0] = new MultiPoint([cspPointsAlibaba]);
            geoCspPointsCloudit[0] = new MultiPoint([cspPointsCloudit]);
            geoCspPointsIBM[0] = new MultiPoint([cspPointsIBM]);
            geoCspPointsTencent[0] = new MultiPoint([cspPointsTencent]);
        
            infoAlert('Registered Cloud Regions: '+obj.connectionconfig.length)
  
      } 
    });
  }
  http.request(mcisOptions, function (response) {
    handleResponse(response);
  }).end();
}
window.getConnection = getConnection;



function isNormalInteger(str) {
  var n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n > 0;
}

var createMcisReqTmplt = {
  description: "Made via cb-mapui",
  installMonAgent: "no",
  label: "cb-mapui",
  name: "mcis",
  vm: []
}

var createMcisReqVmTmplt = {
  commonImage: "ubuntu18.04",
  commonSpec: "",
  description: "mapui",
  label: "DynamicVM",
  vmGroupSize: "",
}

function createMcis() {
  if (recommendedSpecList.length != 0) {

    var hostname = hostnameElement.value;
    var port = portElement.value;
  
    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;
    var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
  
    var namespace = document.getElementById("namespace").value;
    // var mcisid = document.getElementById("mcisid").value;
  
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcisDynamic`
  
    var randomString = Math.random().toString(36).substr(2,5);
    
    var createMcisReq = createMcisReqTmplt;
    createMcisReq.name = "mc-" + `${randomString}`;
    createMcisReq.vm = recommendedSpecList;

    var jsonBody = JSON.stringify(createMcisReq, undefined, 4);

    var vmGroupReqString = '';
    for(i = 0; i < createMcisReq.vm.length; i++) {
      var html = 
      '<br><br></b> [VM group ' + i.toString()  + '] <b>' + 
      '<br></b> image: <b>' + createMcisReq.vm[i].commonImage +
      '<br></b> spec: <b>' + createMcisReq.vm[i].commonSpec +
      '<br></b> VM group size: <b>' + createMcisReq.vm[i].vmGroupSize;

      vmGroupReqString = vmGroupReqString + html;
    }

    var hasUserConfirmed = false;

    Swal.fire({
      title: 'Are you sure to create MCIS as follows:',
      width: 600,
      html: 
        '<font size=3>' +
        'MCIS name: <b>' + createMcisReq.name +
        '<br></b> Install CB-Dragonfly monitoring agent? <b>' + createMcisReq.installMonAgent +
        
        vmGroupReqString,
      showCancelButton: true,
      confirmButtonText: 'Confirm',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      if (result.isConfirmed) {
        messageTextArea.value = " Creating MCIS ...";
        document.getElementById("createMcis").style.color = "#FF0000";
      
        axios({
          method: 'post',
          url: url,
          headers: { 'Content-Type': 'application/json' },
          data: jsonBody,
          auth: {
            username: `${username}`,
            password: `${password}`
          }
          
        })
        .then((res)=>{
          console.log(res); // for debug
          document.getElementById("createMcis").style.color = "#000000";
          messageTextArea.value = "[Complete: MCIS Info]\n" + JSON.stringify(res.data, null, 2);
          updateMcisList();
          clearCircle("none")
        });
      }
    })

  } else {
    messageTextArea.value = " To create a MCIS, VMs should be configured!\n Click the Map to add a config for VM request.";
    errorAlert("Please configure MCIS first\n(Click the Map to add VMs)")
  }
}
window.createMcis = createMcis;

function getRecommendedSpec(idx, latitude, longitude) {
  
  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  // var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  // var namespace = document.getElementById("namespace").value;
  // var mcisid = document.getElementById("mcisid").value;

  // var latitude = document.getElementById("latitude").value;
  // var longitude = document.getElementById("longitude").value;

  var minVCPU = document.getElementById("minVCPU").value;
  var maxVCPU = document.getElementById("maxVCPU").value;
  var minRAM = document.getElementById("minRAM").value;
  var maxRAM = document.getElementById("maxRAM").value;
  
  
  var url = `http://${hostname}:${port}/tumblebug/mcisRecommendVm`

  var struct01 = {
    filter: {
      policy: [
        {
          condition: [
            {
              operand: `${minVCPU}`,
              operator: ">="
            },
            {
              operand: `${maxVCPU}`,
              operator: "<="
            }
          ],
          metric: "cpu",
        },
        {
          condition: [
            {
              operand: `${minRAM}`,
              operator: ">="
            },
            {
              operand: `${maxRAM}`,
              operator: "<="
            }
          ],
          metric: "memory",
        }
      ]
    },
    limit: "10",
    priority: {
      policy: [
        {
          metric: "location",
          parameter: [
            {
              key: "coordinateClose",
              val: [
                `${latitude}/${longitude}`
              ]
            }
          ],
          weight: "1.0"
        }
      ]
    }
  }

  var struct02 = {
    filter: {
      policy: [
        {
          condition: [
            {
              operand: `${minVCPU}`,
              operator: ">="
            },
            {
              operand: `${maxVCPU}`,
              operator: "<="
            }
          ],
          metric: "cpu",
        },
        {
          condition: [
            {
              operand: `${minRAM}`,
              operator: ">="
            },
            {
              operand: `${maxRAM}`,
              operator: "<="
            }
          ],
          metric: "memory",
        }
      ]
    },
    limit: "10",
    priority: {
      policy: [
        {
          metric: "cost",
          weight: "1.0"
        }
      ]
    }
  }

  var struct03 = {
    filter: {
      policy: [
        {
          condition: [
            {
              operand: `${minVCPU}`,
              operator: ">="
            },
            {
              operand: `${maxVCPU}`,
              operator: "<="
            }
          ],
          metric: "cpu",
        },
        {
          condition: [
            {
              operand: `${minRAM}`,
              operator: ">="
            },
            {
              operand: `${maxRAM}`,
              operator: "<="
            }
          ],
          metric: "memory",
        }
      ]
    },
    limit: "10",
    priority: {
      policy: [
        {
          metric: "performance",
          weight: "1.0"
        }
      ]
    }
  }

  var jsonBody = JSON.stringify(struct01);
  if (recommendPolicy.value == "price"){
    jsonBody = JSON.stringify(struct02);
  } else if (recommendPolicy.value == "performance"){
    jsonBody = JSON.stringify(struct03);
  }

  axios({
    method: 'post',
    url: url,
    headers: { 'Content-Type': 'application/json' },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`
    }
    
  })
  .then((res)=>{
    console.log(res); // for debug
    addRegionMarker(res.data[0].id);
    //document.getElementById("latLonInputPairArea").innerHTML += `${res.data[0].id}<br>`;

    messageDetailTextArea.value = JSON.stringify(res.data, null, 2);
    // messageDetailTextArea.scrollTop = messageDetailTextArea.scrollHeight;

    if (tableDisplayEnabled.checked){
      jsonToTable(JSON.stringify(res.data));
    }

    var createMcisReqVm = $.extend( {}, createMcisReqVmTmplt );
    createMcisReqVm.commonSpec = res.data[0].id;

    Swal.fire({
      title: 'Please provide the number of VMs to create (1 ~ 10)',
      width: 600,
      html: 
        '<font size=3>' +
        'Spec to add: <b>' + res.data[0].cspSpecName +

        '<br><br></b> vCPU: <b>' + res.data[0].numvCPU +
        '<br></b> Mem(GiB): <b>' + res.data[0].memGiB +
        '<br></b> Cost($/1H): <b>' + res.data[0].costPerHour +
        
        '<br><br></b> namespace: <b>' + res.data[0].namespace +
        '<br></b> connConfig: <b>' + res.data[0].connectionName +
        '<br></b> CSP: <b>' + res.data[0].providerName +
        '<br></b> Region: <b>' + res.data[0].regionName,
      input: 'number',
      inputValue: '1',
      didOpen: () => {
        const input = Swal.getInput()
        input.setSelectionRange(0, input.value.length)
      },
      inputAttributes: {
        autocapitalize: 'off'
      },
      showCancelButton: true,
      confirmButtonText: 'Confirm',
      //showLoaderOnConfirm: true,
      position: 'top-end',
      //back(disabled section)ground color
      backdrop: `rgba(0, 0, 0, 0.05)`,
      allowOutsideClick: () => !Swal.isLoading()
    }).then((result) => {
      // result.value is false if result.isDenied or another key such as result.isDismissed
      if (result.value) {
        createMcisReqVm.vmGroupSize = result.value;
        if (isNaN(createMcisReqVm.vmGroupSize)) {
          createMcisReqVm.vmGroupSize = 1
        }
        messageTextArea.value += `${createMcisReqVm.commonSpec}` + `\t(${createMcisReqVm.vmGroupSize})`
        recommendedSpecList.push(createMcisReqVm);
      } else {
        messageTextArea.value = messageTextArea.value.replace(/\n.*$/, '')
        latLonInputPairIdx--;
        cspPointsCircle.pop();
        geoCspPointsCircle.pop();
      }
    })
  });
}
window.getRecommendedSpec = getRecommendedSpec;

function range_change(obj) {
  document.getElementById('myvalue').value=obj.value;
}
window.range_change = range_change;

(function() {
  const parentS = document.querySelectorAll('.range-slider');

  if (!parentS) {
      return;
  }

  parentS.forEach((parent) => {
    const rangeS = parent.querySelectorAll('input[type="range"]'),
          numberS = parent.querySelectorAll('input[type="number"]');

    rangeS.forEach((el) => {
        el.oninput = () => {
            let slide1 = parseFloat(rangeS[0].value),
                slide2 = parseFloat(rangeS[1].value);

            if (slide1 > slide2) {
                [slide1, slide2] = [slide2, slide1];
            }

            numberS[0].value = slide1;
            numberS[1].value = slide2;
        }
    });

    numberS.forEach((el) => {
        el.oninput = () => {
            let number1 = parseFloat(numberS[0].value),
                number2 = parseFloat(numberS[1].value);

            if (number1 > number2) {
                let tmp = number1;
                numberS[0].value = number2;
                numberS[1].value = tmp;
            }

            rangeS[0].value = number1;
            rangeS[1].value = number2;
        }
    });
  });
})();

function addRegionMarker(spec) {
  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/system-purpose-common-ns/resources/spec/${spec}`

  axios({
    method: 'get',
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`
    }
    
  })
  .then((res)=>{
    console.log("in addRegionMarker(); "); // for debug
    console.log(res)

    var connConfig = res.data.connectionName;
    console.log(connConfig)

    url = `http://${hostname}:${port}/tumblebug/connConfig/${connConfig}`

    axios({
      method: 'get',
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`
      }
      
    })
    .then((res2)=>{
      console.log("Best cloud location: [" + res2.data.Location.latitude + "," +res2.data.Location.longitude+"]"); // for debug

      // push order [longitute, latitude]
      cspPointsCircle.push([res2.data.Location.longitude, res2.data.Location.latitude])
      geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
    });
  });
}
window.addRegionMarker = addRegionMarker;


function controlMCIS(action) {
  switch(action) {
    case 'refine':
    case 'suspend':
    case 'resume':
    case 'reboot':
    case 'terminate':
      break;
    default:
      console.log(`The actions ${action} is not supported. Supported actions: refine, suspend, resume, reboot, terminate.`);
      return
  }
  messageTextArea.value = "[MCIS " +action +"]";

  infoAlert('MCIS control:['+ action + ']');

  var hostname = hostnameElement.value;
  var port = portElement.value;
  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var namespace = document.getElementById("namespace").value;
  var mcisid = document.getElementById("mcisid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/control/mcis/${mcisid}?action=${action}`

  console.log('MCIS control:['+ action + ']');

  axios({
    method: 'get',
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`
    }
    
  })
  .then((res)=>{
    
    if ( res.data != null ){
      console.log(res.data);
      messageTextArea.value = res.data.message;
    }
  });

}
window.controlMCIS = controlMCIS;


function statusMCIS() {

  messageTextArea.value = "[Get MCIS status]";

  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;
  var mcisid = document.getElementById("mcisid").value;

  // var http = require('http');
  var mcisOptions = {
    hostname: hostname,
    port: port,
    path: '/tumblebug/ns/' + namespace + '/mcis/' + mcisid + '?option=status',
    method: 'GET',
    headers: {
      "Authorization" : auth
    }
  };

  function handleResponse(response) {
    var serverData = '';
    response.on('data', function (chunk) {
      serverData += chunk;
    });
    response.on('end', function () {
      console.log("[Status MCIS]");
      var obj = JSON.parse(serverData);
      if ( obj.status != null ){
        console.log(obj.status);
        messageTextArea.value = "[Status MCIS]\n" + JSON.stringify(obj.status, null, 2);
      }
    });
  }

  http.request(mcisOptions, function (response) {
    handleResponse(response);
  }).end();
}
window.statusMCIS = statusMCIS;


function deleteMCIS() {
  messageTextArea.value = "Deleting MCIS";

  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;
  var mcisid = document.getElementById("mcisid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}?option=terminate`

  infoAlert('Deleting MCIS (option=terminate): ' + mcisid);

  axios({
    method: 'delete',
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`
    }
    
  })
  .then((res)=>{
    console.log(res); // for debug
    //clearMap();
    messageTextArea.value = JSON.stringify(res.data);
    updateMcisList();
    clearMap();
  });

}
window.deleteMCIS = deleteMCIS;

function releaseResources() {
  messageTextArea.value = " [Removing all associated default resources ...]";

  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;
  var mcisid = document.getElementById("mcisid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/defaultResources`

  axios({
    method: 'delete',
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`
    }
    
  })
  .then((res2)=>{
    console.log(res2); // for debug
    messageTextArea.value += JSON.stringify(res2.data, null, 2);
  });

}
window.releaseResources = releaseResources;

function resourceOverview() {
  messageTextArea.value = " [Inspect all resources and overview them ...]\n";
  document.getElementById("resourceOverview").style.color = "#FF0000";

  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;
  var mcisid = document.getElementById("mcisid").value;

  var url = `http://${hostname}:${port}/tumblebug/inspectResourcesOverview`

  axios({
    method: 'get',
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`
    }
  })
  .then((res2)=>{
    console.log(res2); // for debug
    messageTextArea.value += JSON.stringify(res2.data, null, 2) + "\n";
    document.getElementById("resourceOverview").style.color = "#000000";
  });

}
window.resourceOverview = resourceOverview;

// function for registerCspResource by registerCspResource button item
function registerCspResource() {

    messageTextArea.value = " [Registering all CSP's resources]";
    document.getElementById("registerCspResource").style.color = "#FF0000";
  
    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;
    var namespace = document.getElementById("namespace").value;
  
    var url = `http://${hostname}:${port}/tumblebug/registerCspResourcesAll`
    
    var commandReqTmp = {
      mcisName: "csp",
      nsId:`${namespace}`
    }
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);
  
    axios({
      method: 'post',
      url: url,
      headers: { 'Content-Type': 'application/json' },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`
      }
      
    })
    .then((res)=>{
      console.log(res); // for debug
      document.getElementById("registerCspResource").style.color = "#000000";
      messageTextArea.value = "[Complete: Registering all CSP's resources]\n" + JSON.stringify(res.data, null, 2).replaceAll(/\\n/g, newline +'\t' +'\t');
    });
}
window.registerCspResource = registerCspResource;


function updateMcisList() {
  // Clear options in 'select'
  var selectElement = document.getElementById('mcisid');
  var i, L = selectElement.options.length - 1;
  for(i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var hostname = hostnameElement.value;
  var port = portElement.value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis?option=status`

  axios({
    method: 'get',
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`
    }
    
  })
  .then((res)=>{
    if ( res.data.mcis != null ){
      for (let item of res.data.mcis) {
        var option = document.createElement("option");
        option.value = item.name;
        option.text = item.name;
        document.getElementById('mcisid').appendChild(option);
      }
    }
  });
}
window.updateMcisList = updateMcisList;


// function for sleep
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// fucntion for deployApp (mock)

// function deployApp() {

//   messageTextArea.value = " Deploying Video Conference Server ...";
//   console.log(messageTextArea.value); 

//   console.log("before");
//   sleep(5000).then(() => messageTextArea.value = " [Complete]\n Deployed Video Conference Server !\n Access to https://happy.cloud-barista.org");

// }
// window.deployApp = deployApp;


// function for startApp by startApp button item
function startApp() {
  var mcisid = document.getElementById("mcisid").value;
  if (mcisid) {

    messageTextArea.value = " Starting " + selectApp.value;
    document.getElementById("startApp").style.color = "#FF0000";
  
    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;
    var namespace = document.getElementById("namespace").value;
  
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}`
    var cmd = ""
    if (selectApp.value == "Xonotic"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/startServer.sh; chmod +x ~/startServer.sh; sudo ~/startServer.sh " + "Xonotic-by-Cloud-Barista-" + mcisid
    } else if (selectApp.value == "Westward"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh; chmod +x ~/setgame.sh; sudo ~/setgame.sh"
    } else if (selectApp.value == "Nginx"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setweb.sh -O ~/setweb.sh; chmod +x ~/setweb.sh; sudo ~/setweb.sh"
    } else if (selectApp.value == "Jitsi"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh; chmod +x ~/setgame.sh; sudo ~/setgame.sh"
    } else {
      cmd = "ls -al"
    }
    
    var commandReqTmp = {
      command: `${cmd}`
    }
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);
  
    axios({
      method: 'post',
      url: url,
      headers: { 'Content-Type': 'application/json' },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`
      }
      
    })
    .then((res)=>{
      console.log(res); // for debug
      document.getElementById("startApp").style.color = "#000000";
      messageTextArea.value = "[Complete: Deployed App]\n" + JSON.stringify(res.data, null, 2).replaceAll(/\\n/g, newline +'\t' +'\t');
    });
  } else {
    messageTextArea.value = " MCIS ID is not assigned";
  }
}
window.startApp = startApp;

// function for stopApp by stopApp button item
function stopApp() {
  var mcisid = document.getElementById("mcisid").value;
  if (mcisid) {

    messageTextArea.value = " Stopping " + selectApp.value;
    document.getElementById("stopApp").style.color = "#FF0000";
  
    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;
    var namespace = document.getElementById("namespace").value;
  
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}`
    var cmd = ""
    if (selectApp.value == "Xonotic"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh; chmod +x ~/stopServer.sh; sudo ~/stopServer.sh"
    } else if (selectApp.value == "Westward"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh; chmod +x ~/setgame.sh; sudo ~/setgame.sh"
    } else if (selectApp.value == "Nginx"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh; chmod +x ~/setgame.sh; sudo ~/setgame.sh"
    } else if (selectApp.value == "Jitsi"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh; chmod +x ~/setgame.sh; sudo ~/setgame.sh"
    } else {
      cmd = "ls -al"
    }
    
    var commandReqTmp = {
      command: `${cmd}`
    }
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);
  
    axios({
      method: 'post',
      url: url,
      headers: { 'Content-Type': 'application/json' },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`
      }
      
    })
    .then((res)=>{
      console.log(res); // for debug
      document.getElementById("stopApp").style.color = "#000000";
      messageTextArea.value = "[Complete: Stopping App]\n" + JSON.stringify(res.data, null, 2).replaceAll(/\\n/g, newline +'\t' +'\t');
    });
  } else {
    messageTextArea.value = " MCIS ID is not assigned";
  }
}
window.stopApp = stopApp;

// function for statusApp by statusApp button item
function statusApp() {
  var mcisid = document.getElementById("mcisid").value;
  if (mcisid) {

    messageTextArea.value = " Getting status " + selectApp.value;
    document.getElementById("statusApp").style.color = "#FF0000";
  
    var hostname = hostnameElement.value;
    var port = portElement.value;
    var username = document.getElementById("username").value;
    var password = document.getElementById("password").value;
    var namespace = document.getElementById("namespace").value;
  
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/mcis/${mcisid}`
    var cmd = ""
    if (selectApp.value == "Xonotic"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/statusServer.sh; chmod +x ~/statusServer.sh; sudo ~/statusServer.sh"
    } else if (selectApp.value == "Westward"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh; chmod +x ~/setgame.sh; sudo ~/setgame.sh"
    } else if (selectApp.value == "Nginx"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh; chmod +x ~/setgame.sh; sudo ~/setgame.sh"
    } else if (selectApp.value == "Jitsi"){
      cmd = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh; chmod +x ~/setgame.sh; sudo ~/setgame.sh"
    } else {
      cmd = "ls -al"
    }
    
    var commandReqTmp = {
      command: `${cmd}`
    }
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);
  
    axios({
      method: 'post',
      url: url,
      headers: { 'Content-Type': 'application/json' },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`
      }
      
    })
    .then((res)=>{
      console.log(res); // for debug
      document.getElementById("statusApp").style.color = "#000000";
      messageTextArea.value = "[Complete: Getting App status]\n" + JSON.stringify(res.data, null, 2).replaceAll(/\\n/g, newline +'\t' +'\t');
    });
  } else {
    messageTextArea.value = " MCIS ID is not assigned";
  }
}
window.statusApp = statusApp;













window.onload = function() {
  updateMcisList();
}


// Draw

function drawMCIS(event) {

  //event.frameState = event.frameState / 10;
  //console.log("event.frameState");
  //console.log(event.frameState);


  var vectorContext = getVectorContext(event);
  var frameState = event.frameState;
  var theta = 2 * Math.PI * frameState.time / omegaTheta;


  // Draw CSP location first
  if (Array.isArray(geoCspPointsCloudit) && geoCspPointsCloudit.length ) {
    // array exists and is not empty

    vectorContext.setStyle(iconStyleAzure);
    vectorContext.drawGeometry(geoCspPointsAzure[0]);
    vectorContext.setStyle(iconStyleAws);
    vectorContext.drawGeometry(geoCspPointsAws[0]);
    vectorContext.setStyle(iconStyleGcp);
    vectorContext.drawGeometry(geoCspPointsGcp[0]);
    vectorContext.setStyle(iconStyleAlibaba);
    vectorContext.drawGeometry(geoCspPointsAlibaba[0]);
    vectorContext.setStyle(iconStyleCloudit);
    vectorContext.drawGeometry(geoCspPointsCloudit[0]);
    vectorContext.setStyle(iconStyleIBM);
    vectorContext.drawGeometry(geoCspPointsIBM[0]);
    vectorContext.setStyle(iconStyleTencent);
    vectorContext.drawGeometry(geoCspPointsTencent[0]);

  }

  if (cspPointsCircle.length) {
    //console.log("cspPointsCircle.length:" +cspPointsCircle.length + "cspPointsCircle["+cspPointsCircle+"]")
    //geoCspPointsCircle[0] = new MultiPoint([cspPointsCircle]);
    vectorContext.setStyle(iconStyleCircle);
    vectorContext.drawGeometry(geoCspPointsCircle[0]);
  }

  //console.log( geometries );
  for (i = geometries.length -1; i >= 0; --i) {
    var polyStyle = new Style({
      stroke: new Stroke({
        width: 1,
        color: cororLineList[i % cororList.length]
      }),
      fill: new Fill({
        color: cororList[i % cororList.length]
      })
    });
    
    vectorContext.setStyle(polyStyle);
    vectorContext.drawGeometry(geometries[i]);

    vectorContext.setStyle(iconStyle03);
    vectorContext.drawGeometry(geometriesPoints[i]);

    // MCIS status style
    var polyStatusTextStyle = new Style({
      // MCIS status text style
      text: new Text({
        text: mcisStatus[i],
        font: 'bold 12px sans-serif',
        scale: changeSizeStatus(mcisName[i]+mcisStatus[i]),
        offsetY: 110,
        stroke: new Stroke({
          color: 'white',
          width: 1
        }),
        fill: new Fill({
          color: changeColorStatus(mcisStatus[i])
        })
      }),

    });
    vectorContext.setStyle(polyStatusTextStyle);
    vectorContext.drawGeometry(geometries[i]);
  }

  for (i = geometries.length -1; i >= 0; --i) {
    // MCIS text style
    var polyNameTextStyle = new Style({
      text: new Text({
        text: mcisName[i],
        font: 'bold 12px sans-serif',
        scale: (changeSizeByName(mcisName[i]+mcisStatus[i]) + 0.8 ),
        offsetY: 60,
        stroke: new Stroke({
          color: 'white',
          width: 1
        }),
        fill: new Fill({
          color: 'black' //changeColorStatus(mcisStatus[i])
        })
      }),
    });

    vectorContext.setStyle(polyNameTextStyle);
    vectorContext.drawGeometry(geometries[i]);
  }


  map.render();
}


tileLayer.on('postrender', function (event) {
  drawMCIS(event);

});



// Section for general tools

function jsonToTable( jsonText ) {
  let arr00 = new Array();
	let arr01 = new Array();
	let arr02 = new Array();
	let arr03 = new Array();
  let arr04 = new Array();
  let arr05 = new Array();
	
	let json = JSON.parse(jsonText);

	for(i=0; i<json.length; i++){ 
    arr00[i] = json[i].connectionName;
		arr01[i] = json[i].cspSpecName;
		arr02[i] = json[i].numvCPU;
		arr03[i] = json[i].memGiB;
    arr04[i] = json[i].costPerHour;
		arr05[i] = json[i].evaluationScore09;
	}
  table.innerHTML = "";

  // Header
  let tr0 = document.createElement("tr");

  let th0 = document.createElement("th");			  
  th0.appendChild(document.createTextNode("   cspRegion"));
  let th1 = document.createElement("th");			  
  th1.appendChild(document.createTextNode("   cspSpecName"));
  let th2 = document.createElement("th");			 
  th2.appendChild(document.createTextNode("   numvCPU"));
  let th3 = document.createElement("th");			 
  th3.appendChild(document.createTextNode("   memGiB"));
  let th4 = document.createElement("th");			 
  th4.appendChild(document.createTextNode("   costPerHour"));
  let th5 = document.createElement("th");			 
  th5.appendChild(document.createTextNode("   evaluationScore"));

  tr0.appendChild(th0);
  tr0.appendChild(th1);
  tr0.appendChild(th2);
  tr0.appendChild(th3);
  tr0.appendChild(th4);
  tr0.appendChild(th5);
  table.appendChild(tr0);

	for(i=0; i<arr01.length; i++){
		let tr = document.createElement("tr");

    let td0 = document.createElement("td");			  
    td0.appendChild(document.createTextNode(" "+arr00[i] + ""));
		
		let td1 = document.createElement("td");			  
		td1.appendChild(document.createTextNode(" "+arr01[i] + ""));
		
		let td2 = document.createElement("td");			 
		td2.appendChild(document.createTextNode(" "+arr02[i] + ""));
		
		let td3 = document.createElement("td");			 
		td3.appendChild(document.createTextNode(" "+arr03[i]+ ""));

		let td4 = document.createElement("td");			 
		td4.appendChild(document.createTextNode(" "+arr04[i] + ""));
		
		let td5 = document.createElement("td");			 
		td5.appendChild(document.createTextNode(" "+arr05[i]+ ""));

    tr.appendChild(td0);
		tr.appendChild(td1);
		tr.appendChild(td2);
		tr.appendChild(td3);
		tr.appendChild(td4);
		tr.appendChild(td5);

		table.appendChild(tr);
	}
}
