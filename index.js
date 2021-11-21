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
  var hostname = document.getElementById("hostname").value;
  var port = document.getElementById("port").value;
  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var namespace = document.getElementById("namespace").value;
  var refresh = document.getElementById("refreshInterval").value;
  
  window.location.reload()

  // fill elements with data before reload
  document.getElementById("hostname").value = String(hostname);
  document.getElementById("port").value = port;
  document.getElementById("username").value = username;
  document.getElementById("password").value = password;
  document.getElementById("namespace").value = namespace;
  document.getElementById("refreshInterval").value = refresh;
}
window.clearMap = clearMap;

function clearCoordinates() {
  //document.getElementById("latLonInputPairArea").innerHTML = '';
  messageTextArea.value = '';
  latLonInputPairIdx = 0;
  recommendedSpecList = [];
}
window.clearCoordinates = clearCoordinates;

function writeLatLonInputPair(idx, lat, lon) {
  var recommendedSpec = getRecommendedSpec(idx, lat, lon);
  var latf = lat.toFixed(4);
  var lonf = lon.toFixed(4);

  //document.getElementById("latLonInputPairArea").innerHTML += 
  `VM ${idx+1}: (${latf}, ${lonf}) / `
  if (idx == 0) {
    messageTextArea.value = ``
  }
  messageTextArea.value += ` - [VM-${idx+1}]  Location:  ${latf}, ${lonf}    |    Best Spec: `
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
var geoCspPointsAzure = new Array();
var geoCspPointsAws = new Array();
var geoCspPointsGcp = new Array();
var geoCspPointsAlibaba = new Array();
var geoCspPointsCloudit = new Array();


http.get(csvPath,
  (response) => {
    response
      .pipe(csv())
      .on("data", (chunk) => cloudLocation.push(chunk))
      .on("end", () => {
        console.log(cloudLocation);
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
        }
        geoCspPointsAzure[0] = new MultiPoint([cspPointsAzure]);
        geoCspPointsAws[0] = new MultiPoint([cspPointsAws]);
        geoCspPointsGcp[0] = new MultiPoint([cspPointsGcp]);
        geoCspPointsAlibaba[0] = new MultiPoint([cspPointsAlibaba]);
        geoCspPointsCloudit[0] = new MultiPoint([cspPointsCloudit]);
      });
  }
);
  

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

var pointFeature = new Feature({
  geometry: new Point([10, -3]),
  name: '보이지 않는 꿈의 섬'

}
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

var iconStyle01 = new Style({
  image: new Icon(({
    //anchor: [0.5, 0.5],
    crossOrigin: 'anonymous',
    src: 'img/icon2.png',
    opacity: 0.60,
    imgSize: [50, 50]
  }))
});

var iconStyle02 = new Style({
  image: new Icon(({
    anchor: [0.5, 46],
    anchorXUnits: 'fraction',
    anchorYUnits: 'pixels',
    opacity: 0.95,
    src: 'img/icon2.png'
  }))
});

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
    scale: 0.9
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
    scale: 0.9
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
    scale: 0.9
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
    scale: 0.9
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
    scale: 0.9
  }))
});



var vectorLayer = new VectorLayer({
  source: new VectorSource({
    features: [pointFeature]
  }),
  style: new Style({
    image: new Icon({
      anchor: [0.5, 46],
      anchorXUnits: 'fraction',
      anchorYUnits: 'pixels',
      opacity: 0.95,
      src: 'img/icon.png'
    }),
    stroke: new Stroke({
      width: 4,
      color: [255, 0, 0, 1]
    }),
    fill: new Fill({
      color: [0, 0, 255, 0.6]
    })
  })
});


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
    return 'orange';
  } else if (status.includes("Running")){
    return 'bleu';
  } else if (status.includes("Suspending")){
    return 'black';
  } else if (status.includes("Creating")){
    return 'yellow';
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
    return 3.0;
  } else if (status.includes("Suspending")){
    return 2.5;
  } else if (status.includes("Suspended")){
    return 2.5;
  } else if (status.includes("Creating")){
    return 2.9;
  } else if (status.includes("Terminated")){
    return 2.5;
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

/*
var geoip2 = require('geoip-lite');
function getGeoIp(){
  var ip2 = "52.64.97.11";
var geo2 = geoip2.lookup(ip2);
console.log(geo2);
}
*/
// CSP icon layer
map.addLayer(iconLayer2);
map.addLayer(iconLayer3);
map.addLayer(iconLayer4);
map.addLayer(iconLayer5);
map.addLayer(iconLayer6);

map.addLayer(iconLayer);

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
}

function createMcis() {
  messageTextArea.value = " Creating MCIS ...";

  var hostname = document.getElementById("hostname").value;
  var port = document.getElementById("port").value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;
  // var mcisid = document.getElementById("mcisid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcisDynamic`

  var randomString = Math.random().toString(36).substr(2,5);
  
  var createMcisReq = createMcisReqTmplt;
  createMcisReq.name = "mcis-" + `${randomString}`;
  createMcisReq.vm = recommendedSpecList;

  var jsonBody = JSON.stringify(createMcisReq, undefined, 4);

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
    messageTextArea.value = JSON.stringify(res.data);
    updateMcisList();
  });
}
window.createMcis = createMcis;

function getRecommendedSpec(idx, latitude, longitude) {
  
  var hostname = document.getElementById("hostname").value;
  var port = document.getElementById("port").value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  // var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  // var namespace = document.getElementById("namespace").value;
  // var mcisid = document.getElementById("mcisid").value;

  // var latitude = document.getElementById("latitude").value;
  // var longitude = document.getElementById("longitude").value;
  
  var url = `http://${hostname}:${port}/tumblebug/ns/common/testRecommendVm`

  var struct = {
    filter: {
      policy: [
        {
          condition: [
            {
              operand: "1",
              operator: "<="
            }
          ],
          metric: "cpu"
        }
      ]
    },
    limit: "5",
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
          weight: "0.3"
        }
      ]
    }
  }

  var jsonBody = JSON.stringify(struct);

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
    //document.getElementById("latLonInputPairArea").innerHTML += `${res.data[0].id}<br>`;
    messageTextArea.value += `${res.data[0].id}\n`

    var createMcisReqVm = $.extend( {}, createMcisReqVmTmplt );
    createMcisReqVm.commonSpec = res.data[0].id;
    recommendedSpecList.push(createMcisReqVm);
  });
}
window.getRecommendedSpec = getRecommendedSpec;

function deleteMCIS() {
  messageTextArea.value = "Deleting MCIS";

  var hostname = document.getElementById("hostname").value;
  var port = document.getElementById("port").value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;
  var mcisid = document.getElementById("mcisid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/mcis/${mcisid}?option=terminate`

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
    messageTextArea.value = JSON.stringify(res.data);
    updateMcisList();
    //map.render();
  });
}
window.deleteMCIS = deleteMCIS;

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
  messageTextArea.value = "MCIS " +action;

  var hostname = document.getElementById("hostname").value;
  var port = document.getElementById("port").value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;
  var mcisid = document.getElementById("mcisid").value;

  var http = require('http');
  var mcisOptions = {
    hostname: hostname,
    port: port,
    path: '/tumblebug/ns/' + namespace + '/control/mcis/' + mcisid + '?action=' + action,
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
      console.log("[Control MCIS]");
      var obj = JSON.parse(serverData);
      if ( obj.message != null ){
        console.log(obj.message);
        messageTextArea.value = obj.message;
      }
    });
  }

  http.request(mcisOptions, function (response) {
    handleResponse(response);
  }).end();
}
window.controlMCIS = controlMCIS;

function updateMcisList() {
  // Clear options in 'select'
  var selectElement = document.getElementById('mcisid');
  var i, L = selectElement.options.length - 1;
  for(i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var hostname = document.getElementById("hostname").value;
  var port = document.getElementById("port").value;

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

window.onload = function() {
  updateMcisList();
}

function getMcis() {
  
  var hostname = document.getElementById("hostname").value;
  var port = document.getElementById("port").value;

  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;
  var auth = "Basic " + new Buffer(username + ":" + password).toString("base64");

  var namespace = document.getElementById("namespace").value;

  refreshInterval = document.getElementById("refreshInterval").value;
  var filteredRefreshInterval = isNormalInteger(refreshInterval) ? refreshInterval : 5;
  setTimeout(() => console.log(getMcis()), filteredRefreshInterval*1000);
    
  var http = require('http');
  var mcisOptions = {
    hostname: hostname,
    port: port,
    path: '/tumblebug/ns/' + namespace + '/mcis?option=status',
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
      console.log("[Get MCIS list from CB-Tumblebug API]");
      //console.log(serverData);
      var obj = JSON.parse(serverData);

      //console.log( obj.mcis[0].vm[0].publicIP );
      //var publicIP = obj.mcis[0].vm[0].publicIP
      //getGeoIp()

      //초기화
      cnt = cntInit;
      //geometries.length = 0;

      //console.log("obj.mcis.length = " + obj.mcis.length);

      //console.log( obj.mcis[0].status );
      //console.log( obj.mcis[1].status );

      //for (i = 0; i < obj.mcis.length; i++) {
      if ( obj.mcis != null ){
        console.log(obj.mcis);
      for (let item of obj.mcis) {
        //console.log("Index:[" + "]obj.mcis[i].name = " + item.name);
        console.log(item);

        //mcisGeo[i] = new Array();

        var vmGeo = [];

        var validateNum = 0;
        for (j = 0; j < item.vm.length; j++) {
          //console.log( obj.mcis[i].vm[j].name );
          //console.log(item.vm[j].publicIP);
          //console.log( obj.mcis[i].vm[j].status );



          //getIpLookup( obj.mcis[i].vm[j].publicIP, 1 ) //1들어가면 1번글로벌 변수에 변수처리 필요함
          //getVmGeo(obj.mcis[i].vm[j].publicIP, i, j)
          //mcisGeo[i][j] = getVmGeoTmp( obj.mcis[i].vm[j].publicIP );


          //vmGeo.push( getVmGeoTmp( item.vm[j].publicIP ) );


          //getVmGeoHttpSync(item.vm[j].publicIP);

          //getVmGeo(item.vm[j].publicIP, cnt, j);
          

          //mcisGeo[i1][i2] = [obj.geo.longitude, obj.geo.latitude];
          /*
          var ipIndex = -1;
          for (var index in ipMap) {
            //console.log("[ipMap[index]] : " + ipMap[index] + "[index] : " + index)
            if (ipMap[index] == item.vm[j].publicIP) {
              ipIndex = index;
            }

          }

          if (ipIndex == -1) {
            //console.log("geoMap[ipIndex] : " + geoMap[ipIndex])

            //get VM Geo location from 3rd service
            //getVmGeoAcc(item.vm[j].publicIP);

            //get VM Geo location from Static data
            //getVmGeoStatic(item.vm[j].publicIP);
            console.log("vm[j].longitude[" + item.vm[j].location.longitude + "]," + " vm[j].latitude[" + item.vm[j].location.latitude + "]");
            getVmGeoInfo(item.vm[j].location.longitude, item.vm[j].location.latitude)

          }

          if (ipIndex != -1) {
            //console.log("geoMap[ipIndex] : " + geoMap[ipIndex])
            vmGeo.push(geoMap[ipIndex])
            validateNum++;
          }
          */
          //console.log("vm[j].longitude[" + item.vm[j].location.longitude + "]," + " vm[j].latitude[" + item.vm[j].location.latitude + "]");
          //getVmGeoInfo(item.vm[j].location.longitude, item.vm[j].location.latitude)
          vmGeo.push([(item.vm[j].location.longitude*1) + (Math.round(Math.random()) * 2 - 1) * Math.random()*1, (item.vm[j].location.latitude*1) + (Math.round(Math.random()) * 2 - 1) * Math.random()*1 ])
          validateNum++;

        }
        if (item.vm.length == 1){
          // handling if there is only one vm so that we can not draw geometry
          vmGeo.pop()
          vmGeo.push([(item.vm[0].location.longitude*1) + Math.random()*0.01, (item.vm[0].location.latitude*1) + Math.random()*0.01 ])
          vmGeo.push([(item.vm[0].location.longitude*1) + Math.random()*0.01, (item.vm[0].location.latitude*1) + Math.random()*0.01 ])
          vmGeo.push([(item.vm[0].location.longitude*1) + Math.random()*0.01, (item.vm[0].location.latitude*1) + Math.random()*0.01 ])
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

          mcisName[cnt] = "[" + item.name + "]"
          mcisStatus[cnt] = item.status

          console.log("item.status is" + item.status);

          //make poly with convexHull
          makePolyArray(vmGeo);

          cnt++;


        }


      }
    }

    });
  }

  http.request(mcisOptions, function (response) {
    handleResponse(response);
  }).end();

}





tileLayer.on('postrender', function (event) {

  //event.frameState = event.frameState / 10;
  //console.log("event.frameState");
  //console.log(event.frameState);




  var vectorContext = getVectorContext(event);
  var frameState = event.frameState;
  var theta = 2 * Math.PI * frameState.time / omegaTheta;


  /*
  coordinates = [];
  //var x = 0;
  //var y = 0;

  for (i = 0; i < n; ++i) {
    var t = theta + 2 * Math.PI * i / n;
    var x = (R + r) * Math.cos(t) + p * Math.cos((R + r) * t / r);
    var y = (R + r) * Math.sin(t) + p * Math.sin((R + r) * t / r);
    // x = n * i *100 + 2e6;
    // y = n * i + 1e6;

    var lon = 360 * Math.random() - 180;
    var lat = 180 * Math.random() - 90;

    //coordinates.push([x, y]);
    coordinates.push([lon, lat]);
    //console.log(x);
    //console.log(y);
    
  }
  */
  //changePoints()


  //vectorContext.drawGeometry(new MultiPoint(coordinates));


  //vectorContext.drawGeometry(new MultiPoint(coordinates));
  //vectorContext.drawGeometry(new MultiPoint(coordinates));

  /*
  for( i=0; i<coordinates.length; ++i){
    var polys = new Polygon([[ coordinates[Math.floor(Math.random()*(coordinates.length-1))], coordinates[Math.floor(Math.random()*(coordinates.length-1))], coordinates[Math.floor(Math.random()*(coordinates.length-1))], coordinates[Math.floor(Math.random()*(coordinates.length-1))] ]]);
    vectorContext.setStyle(polyStyle);
    vectorContext.drawGeometry(polys);
  }
*/
    // Draw CSP location first
    if (Array.isArray(geoCspPointsCloudit) && geoCspPointsCloudit.length) {
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
  }

  //console.log( geometries );
  for (i = geometries.length -1; i >= 0; --i) {

    var polyStyle = new Style({
      /*  image: new Icon({
          anchor: [0.5, 46],
          anchorXUnits: 'fraction',
          anchorYUnits: 'pixels',
          opacity: 0.95,
          src: 'data/icon.png'
        }),
        */
      image: new Icon(({
        //anchor: [0.5, 0.5],
        crossOrigin: 'anonymous',
        src: 'img/icon2.png',
        opacity: 0.60,
        imgSize: [50, 50]
      })),

      stroke: new Stroke({
        width: 1,
        color: cororLineList[i % cororList.length]
      }),
      fill: new Fill({
        color: cororList[i % cororList.length]
      })
    });

    // MCIS text style
    var polyNameTextStyle = new Style({

      text: new Text({
        text: mcisName[i],
        scale: (changeSizeByName(mcisName[i]+mcisStatus[i]) + 0.8 ),
        offsetY: 60,
        stroke: new Stroke({
          color: 'black',
          width: 0.4
        }),
        fill: new Fill({
          color: 'black' //changeColorStatus(mcisStatus[i])
        })
      }),

    });

    // MCIS text style
    var polyStatusTextStyle = new Style({

      // MCIS status text style
      text: new Text({
        text: mcisStatus[i],
        scale: changeSizeStatus(mcisName[i]+mcisStatus[i]),
        offsetY: 110,
        stroke: new Stroke({
          color: 'blue',
          width: 0.3
        }),
        fill: new Fill({
          color: changeColorStatus(mcisStatus[i])
        })
      }),

    });



    vectorContext.setStyle(polyStyle);
    //vectorContext.drawGeometry(mcisGeo[i]);
    vectorContext.drawGeometry(geometries[i]);

    vectorContext.setStyle(iconStyle03);
    vectorContext.drawGeometry(geometriesPoints[i]);

    vectorContext.setStyle(polyNameTextStyle);
    vectorContext.drawGeometry(geometries[i]);

    vectorContext.setStyle(polyStatusTextStyle);
    vectorContext.drawGeometry(geometries[i]);
  }

  //vectorContext.setStyle(imageStyle);

  //console.log(imgPath);

  //vectorContext.setStyle(iconStyle01);

  //vectorContext.drawGeometry(new MultiPoint(coordinates));

  /*
  vectorContext.setStyle(lineStyle);
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


  //var headPoint = new Point(coordinates[coordinates.length - 1]);

  //vectorContext.setStyle(headOuterImageStyle);
  //vectorContext.drawGeometry(headPoint);

  //vectorContext.setStyle(headInnerImageStyle);
  //vectorContext.drawGeometry(headPoint);


  //var headPoly = new Polygon([[[-1e6, -2e6], [-2e6, 1e6], [-1e6, 3e6]]]);
  //vectorContext.setStyle(imageStyle);
  //vectorContext.drawGeometry(headPoly);

  map.render();

});















function getVmGeoTmp(publicIP) {
  for (i = 0; i < ipTmpList.length; i++) {
    if (ipTmpList[i] == publicIP) {
      var returnTmpx = geoTmpList[i][0] + 10 * Math.random();
      var returnTmpy = geoTmpList[i][1] + 10 * Math.random();

      return [returnTmpx, returnTmpy];
    }
  }
}

/*
function getVmGeoHttpSync(publicIP){

  var request = require('sync-request');
  var res = request('GET', 'http://cors-anywhere.herokuapp.com/api.ipgeolocationapi.com/geolocate/'+ publicIP);
  var obj = JSON.parse(res.getBody());
  console.log("obj.geo.longitude" + obj.geo.longitude +"obj.geo.latitude"+ obj.geo.latitude);
  var lon = obj.geo.longitude;
  var lat = obj.geo.latitude;
  lon = lon +5*Math.random();
  lat = lat +5*Math.random();
  return [lon, lat];

}
*/
/*
function getVmGeoHttpASync(publicIP, i1, i2){

  var request = require('sync-request');
  var res = request('GET', 'http://cors-anywhere.herokuapp.com/api.ipgeolocationapi.com/geolocate/'+ publicIP);
  var obj = JSON.parse(res.getBody());
  console.log("obj.geo.longitude" + obj.geo.longitude +"obj.geo.latitude"+ obj.geo.latitude);
  var lon = obj.geo.longitude;
  var lat = obj.geo.latitude;
  lon = lon +5*Math.random();
  lat = lat +5*Math.random();
  return [lon, lat];

}*/



function getVmGeo(publicIP, i1, i2) {

  var http = require('http');

  var Options = {
    //hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocation.io',
    hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocationapi.com',
    //port: 1323,
    path: '/geolocate/' + publicIP,
    method: 'GET',
    headers: {
      //'Content-Type': 'application/json',
      //'Origin': 'https://ipgeolocation.io',
      //'Referer': 'https://ipgeolocation.io/',
      //'Sec-Fetch-Mode': 'no-cors'
    }
  };

  /*
 var Options = {
  //hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocation.io',
  //http://api.ipstack.com/129.254.175.187?access_key=[geoServiceKey]&format=1
  hostname: 'cors-anywhere.herokuapp.com/api.ipstack.com',
  //port: 1323,
  path: '/'+ publicIP + '?access_key='+geoServiceKey+'&format=1',
  method: 'GET',
  headers: {
    //'access_key': geoServiceKey,
    //'format': '1',
    //'Referer': 'https://ipgeolocation.io/',
    //'Sec-Fetch-Mode': 'no-cors'
  }
};
*/

  function handleResponse(response) {
    var serverData = '';
    response.on('data', function (chunk) {
      serverData += chunk;
    });
    response.on('end', function () {
      console.log("received server data:");
      //console.log(serverData);
      var obj = JSON.parse(serverData);


      //mcisGeo[i1][i2] = [obj.geo.longitude, obj.geo.latitude];


      var ipFlag = 0;
      for (let ipStr of ipMap) {
        if (publicIP == ipStr) {
          ipFlag = 1;
        }
      }
      if (ipFlag == 0) {
        ipMap.push(publicIP);
        geoMap.push([obj.geo.longitude + 2 * Math.random() - 2 * Math.random(), obj.geo.latitude + 2 * Math.random() - 2 * Math.random()]);
      }


    });

  }
  http.request(Options, function (response) {
    handleResponse(response);
    //return lonlat
  }).end();
}




function getVmGeoAcc(publicIP) {

  var http = require('http');

 var Options = {
  //hostname: 'cors-anywhere.herokuapp.com/api.ipgeolocation.io',
  //http://api.ipstack.com/129.254.175.187?access_key=[geoServiceKey]&format=1
  hostname: 'cors-anywhere.herokuapp.com/api.ipstack.com',
  //port: 1323,
  path: '/'+ publicIP + '?access_key='+geoServiceKey+'&format=1',
  method: 'GET',
  headers: {
    //'access_key': geoServiceKey,
    //'format': '1',
    //'Referer': 'https://ipgeolocation.io/',
    //'Sec-Fetch-Mode': 'no-cors'
  }
};

  function handleResponse(response) {
    var serverData = '';
    response.on('data', function (chunk) {
      serverData += chunk;
    });
    response.on('end', function () {
      console.log("[Lookup IP for Geographical location]");
      //console.log(serverData);
      var obj = JSON.parse(serverData);

      var ipFlag = 0;
      for (let ipStr of ipMap) {
        if (publicIP == ipStr) {
          ipFlag = 1;
        }
      }
      if (ipFlag == 0) {
        ipMap.push(publicIP);
        var longitude = obj.longitude +  Math.random() -  Math.random();
        var latitude = obj.latitude +  Math.random() -  Math.random();
        if (obj.longitude == null || obj.longitude == "" || obj.latitude == null || obj.latitude == ""){

          longitude = geoTmpList[geoTmpCnt][0] +  Math.random() -  Math.random();
          latitude = geoTmpList[geoTmpCnt][1] +  Math.random() -  Math.random();
          geoTmpCnt++;
          if(geoTmpCnt == geoTmpList.length){
            geoTmpCnt = 0;
          }
        }

        geoMap.push([longitude,latitude]);
      }


    });

  }
  http.request(Options, function (response) {
    handleResponse(response);
    //return lonlat
  }).end();
}



function getVmGeoStatic(publicIP) {

  longitude = geoTmpList[geoTmpCnt][0] +  Math.random() -  Math.random();
  latitude = geoTmpList[geoTmpCnt][1] +  Math.random() -  Math.random();
  geoTmpCnt++;
  if(geoTmpCnt == geoTmpList.length){
    geoTmpCnt = 0;
  }
  ipMap.push(publicIP);
  geoMap.push([longitude,latitude]);

}

function getVmGeoInfo(lon,lat) {

  var longitude = Number(lon) +  Math.random() -  Math.random();
  var latitude = Number(lat) +  Math.random() -  Math.random();
  geoTmpCnt++;
  if(geoTmpCnt == geoTmpList.length){
    geoTmpCnt = 0;
  }
  //ipMap.push(publicIP);
  geoMap.push([longitude,latitude]);

}