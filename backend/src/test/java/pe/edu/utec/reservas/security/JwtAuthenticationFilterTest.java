package pe.edu.utec.reservas.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock private JwtTokenProvider jwtTokenProvider;
    @Mock private UserDetailsService userDetailsService;
    @Mock private HttpServletRequest req;
    @Mock private HttpServletResponse res;
    @Mock private FilterChain chain;
    @InjectMocks private JwtAuthenticationFilter filter;

    @AfterEach
    void clean() { SecurityContextHolder.clearContext(); }

    @Test
    void tokenValido_autentica() throws Exception {
        UserDetails ud = User.withUsername("u@utec.edu.pe").password("x").authorities("ROLE_ESTUDIANTE").build();
        when(req.getHeader("Authorization")).thenReturn("Bearer abc.def.ghi");
        when(jwtTokenProvider.validateToken("abc.def.ghi")).thenReturn(true);
        when(jwtTokenProvider.getEmailFromToken("abc.def.ghi")).thenReturn("u@utec.edu.pe");
        when(userDetailsService.loadUserByUsername("u@utec.edu.pe")).thenReturn(ud);

        filter.doFilterInternal(req, res, chain);

        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        assertEquals("u@utec.edu.pe", SecurityContextHolder.getContext().getAuthentication().getName());
        verify(chain).doFilter(req, res);
    }

    @Test
    void sinHeader_noAutentica() throws Exception {
        when(req.getHeader("Authorization")).thenReturn(null);
        filter.doFilterInternal(req, res, chain);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(chain).doFilter(req, res);
    }

    @Test
    void headerSinBearer_noAutentica() throws Exception {
        when(req.getHeader("Authorization")).thenReturn("Basic xyz");
        filter.doFilterInternal(req, res, chain);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(chain).doFilter(req, res);
    }

    @Test
    void tokenInvalido_noAutentica() throws Exception {
        when(req.getHeader("Authorization")).thenReturn("Bearer malo");
        when(jwtTokenProvider.validateToken("malo")).thenReturn(false);
        filter.doFilterInternal(req, res, chain);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        verify(chain).doFilter(req, res);
    }

    @Test
    void shouldNotFilter_endpointsAuthSinPrincipal() {
        when(req.getServletPath()).thenReturn("/api/v1/auth/google");
        assertTrue(filter.shouldNotFilter(req));
    }

    @Test
    void shouldFilter_endpointProtegido() {
        when(req.getServletPath()).thenReturn("/api/v1/reservas");
        assertFalse(filter.shouldNotFilter(req));
    }
}
