import React from "react";

export function PageHeader(props: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="pageHeader">
      <div>
        <div className="pageTitle">{props.title}</div>
        <div className="pageSubtitle">{props.subtitle}</div>
      </div>
      {props.right ? <div className="filters">{props.right}</div> : null}
    </div>
  );
}

