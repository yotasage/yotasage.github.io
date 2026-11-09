// Reads a Gerber job file (.gbrjob, Ucamco's "Gerber Job Format"): the function of each Gerber file, and the
// stackup (thickness, mask and silkscreen colours, finish).
import { Stackup } from './model';

export interface GerberJob {
  // Project name, if given.
  name?: string;
  files: { path: string; function?: string; polarity?: string }[];
  stackup: Stackup;
  // The material stackup from top to bottom, as the file gives it.
  materials: { type: string; name?: string; color?: string; thickness?: number }[];
}

type Json = Record<string, unknown>;

function obj(v: unknown): Json {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function parseGerberJob(text: string): GerberJob {
  const json = obj(JSON.parse(text.replace(/^﻿/, '')));
  // EAGLE and Fusion 360 write "Overall" with "Name": { "ProjectId": … } where the specification has "GeneralSpecs"
  // with "ProjectId": { "Name": … }.
  const general = obj(json.GeneralSpecs ?? json.Overall);
  const files = (Array.isArray(json.FilesAttributes) ? json.FilesAttributes : []).map(obj).map((f) => ({
    path: str(f.Path) ?? '',
    function: str(f.FileFunction),
    polarity: str(f.FilePolarity),
  })).filter((f) => f.path);
  const materials = (Array.isArray(json.MaterialStackup) ? json.MaterialStackup : []).map(obj).map((m) => ({
    type: str(m.Type) ?? '',
    name: str(m.Name),
    color: str(m.Color),
    thickness: num(m.Thickness),
  }));
  const colorOf = (type: string) => materials.find((m) => m.type.toLowerCase() === type && m.color)?.color;
  const stackup: Stackup = {};
  const thickness = num(general.BoardThickness);
  if (thickness !== undefined) stackup.thickness = thickness;
  const mask = colorOf('soldermask');
  if (mask) stackup.mask = mask;
  const silk = colorOf('legend');
  if (silk) stackup.silk = silk;
  const finish = str(general.Finish);
  if (finish) stackup.finish = finish;
  const layers = num(general.LayerNumber);
  if (layers !== undefined) stackup.copperLayers = layers;
  return { name: str(obj(general.ProjectId).Name) ?? str(obj(general.Name).ProjectId), files, stackup, materials };
}
