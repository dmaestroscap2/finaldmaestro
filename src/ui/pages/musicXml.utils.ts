function parseMusicXmlDocument(xmlText: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || "Invalid MusicXML document");
  }
  return doc;
}

function cloneMusicXmlDocument(doc: Document): Document {
  const serializer = new XMLSerializer();
  return parseMusicXmlDocument(serializer.serializeToString(doc));
}

export function parseMusicXml(xmlText: string): Document {
  return parseMusicXmlDocument(xmlText);
}

export function filterMusicXmlByPartName(
  xmlDocument: Document,
  partName: string | null | undefined
): { xmlDocument: Document; matchedPartIds: string[]; usedFilteredDocument: boolean } {
  const wanted = String(partName ?? "").trim().toLowerCase();
  if (!wanted) {
    return {
      xmlDocument: cloneMusicXmlDocument(xmlDocument),
      matchedPartIds: [],
      usedFilteredDocument: false,
    };
  }

  try {
    const doc = cloneMusicXmlDocument(xmlDocument);

    const scoreParts = Array.from(doc.getElementsByTagName("score-part"));
    const matchedPartIds = scoreParts
      .filter((scorePart) => {
        const name = scorePart.getElementsByTagName("part-name")[0]?.textContent?.trim().toLowerCase() ?? "";
        return name === wanted || name.includes(wanted);
      })
      .map((scorePart) => scorePart.getAttribute("id"))
      .filter((id): id is string => Boolean(id));

    if (matchedPartIds.length === 0) {
      return {
        xmlDocument: doc,
        matchedPartIds: [],
        usedFilteredDocument: false,
      };
    }

    for (const scorePart of scoreParts) {
      const id = scorePart.getAttribute("id");
      if (!id || matchedPartIds.includes(id)) continue;
      scorePart.parentNode?.removeChild(scorePart);
    }

    const parts = Array.from(doc.getElementsByTagName("part"));
    for (const part of parts) {
      const id = part.getAttribute("id");
      if (!id || matchedPartIds.includes(id)) continue;
      part.parentNode?.removeChild(part);
    }

    return {
      xmlDocument: doc,
      matchedPartIds,
      usedFilteredDocument: true,
    };
  } catch {
    return {
      xmlDocument: cloneMusicXmlDocument(xmlDocument),
      matchedPartIds: [],
      usedFilteredDocument: false,
    };
  }
}

