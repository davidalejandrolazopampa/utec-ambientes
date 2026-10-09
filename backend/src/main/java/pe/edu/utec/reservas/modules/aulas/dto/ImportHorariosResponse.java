package pe.edu.utec.reservas.modules.aulas.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/** Resumen de una importación de horarios (clases) desde Excel/CSV. Por volumen (miles de filas)
 *  no se devuelve el detalle fila por fila, sino conteos + una muestra de los primeros problemas. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportHorariosResponse {
    private String ciclo;
    private int filasLeidas;
    private int virtualesDescartadas;
    private int ficticiasDescartadas;
    private int reservasDescartadas;   // filas RESV* = reservas del ambiente, no clases
    private int aulasCreadas;
    private int laboratoriosCreados;   // L… no catalogados → lab mínimo INACTIVO
    private int cursosCreados;
    private int docentesCreados;  // usuarios rol DOCENTE dados de alta desde el horario
    private int clasesCreadas;
    private int clasesExistentes; // ya estaban en BD (misma firma) → se conservan, sin duplicar
    private int clasesEliminadas; // solo en modo sincronizar: ya no están en el archivo
    private int clasesOmitidas;   // duplicadas o solapadas
    private int errores;          // filas mal formadas

    @Builder.Default
    private List<String> problemas = new ArrayList<>();  // muestra (máx 50)
}
