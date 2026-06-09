import JSZip from "jszip";
import { saveAs } from "file-saver";

const getKml = (name, corners_coords) => {
  return `<?xml version="1.0" encoding="utf-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"
      xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <Folder>
      <name>${name}</name>
      <GroundOverlay>
        <name>${name}</name>
        <drawOrder>50</drawOrder>
        <Icon>
          <href>files/doc.jpg</href>
        </Icon>
        <altitudeMode>clampToGround</altitudeMode>
        <gx:LatLonQuad>
          <coordinates>
            ${corners_coords.bottom_left.lng},${corners_coords.bottom_left.lat} ${corners_coords.bottom_right.lng},${corners_coords.bottom_right.lat} ${corners_coords.top_right.lng},${corners_coords.top_right.lat} ${corners_coords.top_left.lng},${corners_coords.top_left.lat}
          </coordinates>
        </gx:LatLonQuad>
      </GroundOverlay>
    </Folder>
  </Document>
</kml>`;
};

export const getKMZ = (name, bound, imgBlob) => {
  var zip = new JSZip();
  zip.file("doc.kml", getKml(name, bound));
  var img = zip.folder("files");
  img.file("doc.jpg", imgBlob);
  return zip;
};

export const saveKMZ = (filename, name, bound, imgBlob) => {
  var zip = getKMZ(name, bound, imgBlob);
  zip
    .generateAsync({
      type: "blob",
      mimeType: "application/vnd.google-earth.kmz",
    })
    .then(function (content) {
      saveAs(content, filename);
    });
};

export const extractCornersCoordsFromFilename = (filename) => {
  const re = /(_[-]?\d+(\.\d+)?){8}_\.(gif|png|jpg|jpeg|webp|avif|heif|heic)$/i;
  const found = filename.match(re);
  if (!found) {
    return false;
  } else {
    const coords = found[0].split("_");
    coords.pop();
    coords.shift();
    return coords.join(",");
  }
};

export const validateCornersCoords = (coords) => {
  return coords.match(/^[-]?\d+(\.\d+)?(,[-]?\d+(\.\d+)?){7}$/);
};
