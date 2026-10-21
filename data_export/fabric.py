"""Counterfactual dataset export to a Microsoft Fabric lakehouse.

Parquet tables: events, goals, chains, counterfactual_sequences (each fixed replay saved as a
labelled sequence). Upload to OneLake with azure-storage-file-datalake (OneLake speaks the
ADLS Gen2 API). Fallback: CSV files in exports/.

TODO(day 10). Deps: pyarrow, azure-storage-file-datalake, azure-identity.
"""
