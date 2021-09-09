
export type Property = {
    "detectedLanguages":[
        {"languageCode":"ja","confidence":1},
    ],
    "detectedBreak": null | {
        "type": "EOL_SURE_SPACE",
        "isPrefix": false
    },
};

export type Vertex = {
    x: number, // 603
    y: number, // 79
}

export type BoundingBox = {
    "vertices": Vertex[],
    "normalizedVertices":[],
};

export type NodeBase = {
    "property"?: Property,
    "boundingBox": BoundingBox,
    "confidence": 0.9800000190734863,
};

export type Symbol = NodeBase & {
    "text": "金",
};

export type Word = NodeBase & {
    "symbols": Symbol[],
};

export type Paragraph = NodeBase & {
    "words": Word[],
};

export type Block = NodeBase & {
    "paragraphs": Paragraph[],
    "blockType": "TEXT",
};

export type IndexedBlock = Block & {
    "ocrIndex": number,
};

export type Page = {
    "blocks": Block[],
    "property": Property,
    "width": 685,
    "height": 1024,
    "confidence": 0
};

export type CloudVisionApiResponse = [
    {
        "faceAnnotations": [],
        "landmarkAnnotations": [],
        "logoAnnotations": [],
        "labelAnnotations": [],
        "textAnnotations": {
            "locations": [],
            "properties": [],
            "mid": "",
            "locale": "ja",
            "description": string,
            "score": 0,
            "confidence": 0,
            "topicality": 0,
            "boundingPoly": {"vertices":[{"x":82,"y":57},{"x":637,"y":57},{"x":637,"y":941},{"x":82,"y":941}],"normalizedVertices":[]}
        }[],
        "localizedObjectAnnotations": [],
        "safeSearchAnnotation": null,
        "imagePropertiesAnnotation": null,
        "error": null,
        "cropHintsAnnotation": null,
        /** may be null if image is a blank page for example */
        "fullTextAnnotation"?: {
            "text": string,
            "pages": Page[]
        },
        "webDetection": null,
        "productSearchResults": null,
        "context": null
    }
];
