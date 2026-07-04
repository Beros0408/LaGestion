import React from "react";

const Card = React.forwardRef(function Card(
  { as: Tag = "div", index = 0, className = "", style, children, ...rest },
  ref
) {
  const cls = `lg-card lg-card-enter${className ? ` ${className}` : ""}`;
  const mergedStyle = { animationDelay: `${index * 60}ms`, ...style };
  return (
    <Tag ref={ref} className={cls} style={mergedStyle} {...rest}>
      {children}
    </Tag>
  );
});

export default Card;
