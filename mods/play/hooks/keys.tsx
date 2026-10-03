import type { ClientModule } from "claude-code";

// Click this row once. Keys then arrive here until Escape returns focus to Claude.
const Keys: ClientModule = (_props, surface) => {
  if (surface.state === undefined) {
    surface.setState(true);
    surface.onKey((event) => {
      const name = event.ctrl === true ? `ctrl+${event.key}` : event.key;
      surface.post(name);
    });
  }
  const { Text } = surface.elements;
  return Text({ children: "click here for keys · q back" });
};

export default Keys;
