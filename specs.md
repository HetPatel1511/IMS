# Manufacturing Inventory Management System

## Overview

This project is a configurable inventory management platform designed for manufacturing industries.

Unlike traditional inventory software where item fields are fixed in the database, this system allows administrators to define custom inventory structures without changing code.

The system is metadata-driven.

---

## Goals

Support:

- Raw Materials

- Semi Finished Goods

- Finished Goods

Each inventory type has configurable fields.

Example:

Raw Material

- Grade

- Thickness

- Width

- Length

Finished Goods

- Barcode

- Warranty

- Color

- Packaging

These fields are created from the admin panel.

---

## Core Modules

Authentication

Inventory Types

Dynamic Fields

Categories

Inventory Items

Suppliers

Buyers / Contractors

Dashboard

Settings

Audit Logs

---

## Dynamic Field Types

Text

Long Text

Number

Decimal

Boolean

Date

Date Time

Email

Phone

URL

Dropdown

Multi Select

Radio

Checkbox

Color

File

Image

Currency

Barcode

QR Code

Relationship

---

## Inventory Types

Raw Material

Semi Finished Goods

Finished Goods

Administrators can create additional inventory types if needed.

---

## Categories

Each inventory type supports unlimited categories.

Example

Raw Material

    Steel

    Chemicals

    Rubber

Finished Goods

    Electronics

    Furniture

---

## Suppliers

Store supplier information.

Multiple suppliers may supply one inventory item.

---

## Buyers

Store customer/contractor information.

Future sales module will reference these records.

---

## Inventory Items

Each item consists of

Basic Information

+

Dynamic Attributes

Example

Steel Sheet

Basic

SKU

Name

Current Quantity

Minimum Quantity

Category

Type

Dynamic

Thickness

Grade

Width

Length

Finish

---

## Dynamic Fields

Each inventory type owns a schema.

Each schema contains fields.

Each field contains

Name

Display Name

Type

Required

Unique

Default Value

Validation

Order

Visibility

Filterable

Searchable

---

## Data Storage

Metadata

Inventory Types

Field Definitions

Categories

Suppliers

Buyers

Inventory Values

Dynamic attributes stored separately using an Entity Attribute Value (EAV) model or JSONB-based storage to allow flexible schemas without database migrations.

---

## Future Modules

Purchase Orders

Sales Orders

Warehouse

Production

BOM

Stock Transactions

Reports

Notifications

API Integrations

These modules should integrate without changing the existing inventory architecture.