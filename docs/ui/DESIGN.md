---
name: SoleUp
colors:
  primary: "#b1ff4a"
  secondary: "#6bc1f2"
  surface: "#d7f7e8"
  on-surface: "#dafded"
  error: "#f7471b"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
rounded:
  md: 8px
---

# Design System

## Overview
A focused, minimal interface for a Personal Management.
Clean lines, low visual noise, easy on eyes information display, less reading.
Material 3 Express components.

## Colors
- **Primary** (#b1ff4a): CTAs, active states, key interactive elements
- **Secondary** (#6bc1f2): Supporting UI, chips, secondary actions
- **Surface** (#d7f7e8): Page backgrounds
- **On-surface** (#dafded): Primary text on dark backgrounds
- **Error** (#f7471b): Validation errors, destructive actions

## Typography
- **Headlines**: Inter, semi-bold
- **Body**: Inter, regular, 14–16px
- **Labels**: Inter, medium, 12px, uppercase for section headers

## Components
- **Buttons**: Rounded (8px), primary uses brand blue fill
- **Inputs**: 1px border, subtle surface-variant background
- **Cards**: No elevation, relies on border and background contrast

## Do's and Don'ts
- Do use the primary color sparingly, only for the most important action
- Don't mix rounded and sharp corners in the same view
- Do maintain 4:1 contrast ratio for all text