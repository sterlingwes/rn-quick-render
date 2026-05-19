// Stand-in for bluesky-social-app's `#/components/forms/Toggle`
// module.
//
// Real Toggle pulls in `react-native-reanimated`, `#/lib/haptics`,
// `#/components/icons/Check`, `#/components/hooks/useInteractionState`,
// and `#/env` — none of which the harness loads cleanly. The real
// runtime behaviour we *do* need is the per-item context InterestButton
// reads via `Toggle.useItemContext()`: `selected`, plus the no-op
// interaction flags (`hovered` / `pressed` / `focused`). Without that
// context InterestButton renders every pill in its unselected state.
//
// The mock therefore wires up:
//   - `Group` — passthrough View that publishes the parent-supplied
//     `values: string[]` via context so child Items can decide whether
//     they're selected. No write-back: Items in a snapshot can't fire
//     onChange, so we don't need a setter.
//   - `Item` — reads the group's `values`, derives `selected =
//     values.includes(name)`, publishes an ItemContext for descendants.
//     Renders children as a non-Pressable View since we never press
//     them in a snapshot.
//   - `useItemContext` — the hook InterestButton calls. Returns the
//     ItemState shape Toggle ships in production.
//
// Real Toggle also exports `Checkbox`, `Switch`, `Radio`, `LabelText`,
// `Panel`, and `createSharedToggleStyles`. None of those are imported
// from StepInterests; if a future fixture pulls one in, extend here.

import * as React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export type ItemState = {
  name: string;
  selected: boolean;
  disabled: boolean;
  isInvalid: boolean;
  hovered: boolean;
  pressed: boolean;
  focused: boolean;
};

const EMPTY_ITEM_STATE: ItemState = {
  name: "",
  selected: false,
  disabled: false,
  isInvalid: false,
  hovered: false,
  pressed: false,
  focused: false,
};

const ItemContext = React.createContext<ItemState>(EMPTY_ITEM_STATE);

type GroupContextValue = {
  values: string[];
  disabled: boolean;
  type: "radio" | "checkbox";
};

const GroupContext = React.createContext<GroupContextValue>({
  values: [],
  disabled: false,
  type: "checkbox",
});

export type GroupProps = React.PropsWithChildren<{
  type?: "radio" | "checkbox";
  values: string[];
  maxSelections?: number;
  disabled?: boolean;
  onChange: (value: string[]) => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}>;

export function Group({ children, values, disabled = false, type = "checkbox", style }: GroupProps) {
  const ctx = React.useMemo<GroupContextValue>(
    () => ({ values, disabled, type }),
    [values, disabled, type],
  );
  return (
    <GroupContext.Provider value={ctx}>
      <View style={[{ width: "100%" }, style as ViewStyle]}>{children}</View>
    </GroupContext.Provider>
  );
}

export type ItemProps = {
  type?: "radio" | "checkbox";
  name: string;
  label: string;
  value?: boolean;
  disabled?: boolean;
  onChange?: (selected: boolean) => void;
  isInvalid?: boolean;
  children: ((props: ItemState) => React.ReactNode) | React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Item({
  children,
  name,
  value = false,
  disabled: itemDisabled = false,
  isInvalid,
  style,
}: ItemProps) {
  const { values: selectedValues, disabled: groupDisabled } = React.useContext(GroupContext);

  const selected = selectedValues.includes(name) || !!value;
  const disabled = groupDisabled || itemDisabled;

  const state = React.useMemo<ItemState>(
    () => ({
      name,
      selected,
      disabled,
      isInvalid: isInvalid ?? false,
      hovered: false,
      pressed: false,
      focused: false,
    }),
    [name, selected, disabled, isInvalid],
  );

  return (
    <ItemContext.Provider value={state}>
      <View style={style as ViewStyle}>
        {typeof children === "function" ? children(state) : children}
      </View>
    </ItemContext.Provider>
  );
}

export function useItemContext(): ItemState {
  return React.useContext(ItemContext);
}
